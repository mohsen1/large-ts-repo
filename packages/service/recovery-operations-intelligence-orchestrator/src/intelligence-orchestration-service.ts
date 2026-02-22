import type { RunAssessment, RecoveryRiskSignal, IntelligenceSignalSource } from '@domain/recovery-operations-intelligence';
import type { OrchestrationEvent } from './orchestration-types';
import type { RunSession, RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RoutePolicy, OrchestratedSignalGroup, OrchestrationMetrics, RuntimeHook, OrchestrationTag, ReadinessEnvelope } from './orchestration-types';
import { routeSignals, orchestrateSignalGroups } from './signal-router';
import { publishDecisionTelemetry } from './recovery-queue-service';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import { runIntelligencePipeline } from './pipeline';
import type { PipelineOutput } from './pipeline';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import type { CohortSignalAggregate } from '@domain/recovery-operations-intelligence';

export interface ServiceInput {
  readonly tenant: string;
  readonly runId: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoveryRiskSignal[];
  readonly session: RunSession;
  readonly repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  };
}

export interface ServiceContext {
  readonly policies: readonly RoutePolicy[];
  readonly hooks: readonly RuntimeHook[];
}

export interface ServiceResult {
  readonly runId: string;
  readonly tenant: string;
  readonly pipeline: PipelineOutput;
  readonly metrics: OrchestrationMetrics;
  readonly groups: readonly OrchestratedSignalGroup[];
  readonly cohorts: readonly CohortSignalAggregate[];
}

const initialPolicies: readonly RoutePolicy[] = [
  {
    id: 'policy.standard',
    description: 'Route standard recovery operations signals',
    requiredCoverage: 1,
    maxConcurrency: 4,
    allowAutoRoute: true,
  },
  {
    id: 'policy.safe',
    description: 'Route high risk signals through strict path',
    requiredCoverage: 3,
    maxConcurrency: 2,
    allowAutoRoute: false,
  },
];

const riskBandFor = (score: number): 'green' | 'amber' | 'red' => {
  if (score >= 0.66) return 'red';
  if (score >= 0.33) return 'amber';
  return 'green';
};

const runPolicies = async (
  session: RunSession,
  input: ServiceInput,
  pipeline: PipelineOutput,
  tags: readonly string[],
  repositories: { operations: RecoveryOperationsRepository; intelligence: IntelligenceRepository },
): Promise<void> => {
  const readEnvelope: ReadinessEnvelope = {
    readinessPlan: {
      tenant: withBrand(input.tenant, 'TenantId'),
      windows: input.readinessPlan.windows,
      targetCount: Math.max(1, input.readinessPlan.targets.length),
    },
    mode: 'incident',
    riskThreshold: 0.7 as never,
  };

  await repositories.intelligence.saveBatchAssessment(withBrand(input.tenant, 'TenantId'), {
    cohort: tags.map((tag) => ({
      tenant: withBrand(input.tenant, 'TenantId'),
      runId: withBrand(input.runId, 'IntelligenceRunId'),
      count: tags.length,
      maxConfidence: Math.min(1, pipeline.score),
      distinctSources: [
        ...(pipeline.assessments.some((assessment) => assessment.confidence > 0.8) ? ['policy'] : ['telemetry']),
      ] as readonly IntelligenceSignalSource[],
    })),
    generatedAt: new Date().toISOString(),
    overallRisk: riskBandFor(pipeline.score),
  });

  const events = await publishDecisionTelemetry(
    {
      tenant: input.tenant,
      runId: input.runId,
      signals: session.signals,
      assessments: pipeline.assessments,
      cohort: [],
    },
    input.tenant,
    input.runId,
  );

  await Promise.all(events.map((event: OrchestrationEvent) => repositories.operations.upsertDecision({
    runId: session.runId,
    ticketId: String(event.eventId),
    accepted: true,
    reasonCodes: tags,
    score: pipeline.score,
    createdAt: event.issuedAt,
  })));

  void readEnvelope;
};

const buildMetrics = (
  runId: string,
  tenant: string,
  pipeline: PipelineOutput,
  groups: readonly OrchestratedSignalGroup[],
  startAt: string,
): OrchestrationMetrics => {
  const routeLatencyMs = groups.map((group, index) => 200 + index * 31);
  return {
    sessionId: `${tenant}-${runId}`,
    runId,
    tenant: withBrand(tenant, 'TenantId'),
    startedAt: startAt,
    routeLatencyMs,
    assessmentCount: pipeline.assessments.length,
    cohortCount: groups.length,
    riskBand: riskBandFor(pipeline.score),
  };
};

const toReadinessSignals = (input: ServiceInput): readonly RecoverySignal[] =>
  input.signals.map((signal) => signal.signal);

const pickHookTags = (
  policies: readonly RoutePolicy[],
): readonly string[] =>
  policies.filter((policy) => policy.allowAutoRoute).map((policy) => `${policy.id}=${policy.requiredCoverage}`);

export class RecoveryIntelligenceOrchestratorService {
  constructor(
    private readonly context: {
      readonly hookRegistry: readonly RuntimeHook[];
      readonly signalPolicies: readonly RoutePolicy[];
    } = {
      hookRegistry: [],
      signalPolicies: initialPolicies,
    },
  ) {}

  async run(input: ServiceInput): Promise<ServiceResult> {
    const startAt = new Date().toISOString();
    const routing = routeSignals(input.tenant, input.runId, input.signals);
    const groups = orchestrateSignalGroups(routing);
    const readinessSignals: readonly RecoverySignal[] = toReadinessSignals(input);

    const pipeline = await runIntelligencePipeline(
      {
        tenant: input.tenant,
        runId: withBrand(input.runId, 'IntelligenceRunId'),
        readinessPlan: input.readinessPlan,
        signals: input.signals,
      },
      input.repositories,
    );

    if (!pipeline.ok) {
      throw new Error(`Pipeline failure: ${pipeline.error}`);
    }

    const tags = pickHookTags(this.context.signalPolicies);
    await runPolicies(input.session, input, pipeline.value, tags, input.repositories);

    const assessments = pipeline.value.assessments;
    const cohorts: OrchestrationTag[] = [...new Set(groups.map((item) => item.tag))];
    const tagCohorts = cohorts.map((tag) => {
      const signals = groups
        .filter((group) => group.tag === tag)
        .flatMap((group) => group.signals);
      return {
        tenant: withBrand(input.tenant, 'TenantId'),
        runId: withBrand(input.runId, 'IntelligenceRunId'),
        count: signals.length,
        maxConfidence: signals.length > 0
          ? signals.reduce((acc, signal) => Math.max(acc, signal.signal.confidence), 0)
          : 0,
        distinctSources: ['telemetry', 'queue'] as const,
      };
    }) as readonly CohortSignalAggregate[];

    const runId = withBrand(input.runId, 'RecoveryRunId');

    for (const hook of this.context.hookRegistry) {
      const allowed = await hook.invoke({
        tenant: withBrand(input.tenant, 'TenantId'),
        runId,
        state: 'routed',
        score: pipeline.value.score as never,
        signalCount: readinessSignals.length,
      });
      if (!allowed) {
        throw new Error(`Hook blocked: ${hook.hookName}`);
      }
    }

    return {
      runId: String(runId),
      tenant: input.tenant,
      pipeline: pipeline.value,
      metrics: buildMetrics(input.runId, input.tenant, pipeline.value, groups, startAt),
      groups,
      cohorts: tagCohorts,
    };
  }
}

export const createRecoveryIntelligenceService = (
  hooks: readonly RuntimeHook[] = [],
): RecoveryIntelligenceOrchestratorService => {
  return new RecoveryIntelligenceOrchestratorService({
    hookRegistry: hooks,
    signalPolicies: initialPolicies,
  });
};
