import {
  isHighRiskPlan,
  normalizeTelemetry,
  buildConstellationGraph,
  runConstellationOrchestrator,
  renderGraphRuntime,
} from '@domain/incident-command-models';
import type {
  ConstellationExecutionResult,
  ConstellationOrchestratorInput,
  ConstellationOrchestrationPlan,
  ConstellationSignalEnvelope,
  ConstellationStageId,
  ConstellationTenant,
} from '@domain/incident-command-models';
import type {
  ConstellationPanelState,
  ConstellationPolicyInsight,
  ConstellationSummary,
  ConstellationTimelinePoint,
} from '../types';

export interface ConstellationServiceResult {
  readonly summary: ConstellationSummary;
  readonly plan: ConstellationOrchestrationPlan;
  readonly result: ConstellationExecutionResult;
  readonly signals: readonly ConstellationSignalEnvelope[];
  readonly trace: readonly string[];
}

export interface ConstellationRuntimeInput {
  readonly tenant: string;
  readonly plan: ConstellationOrchestrationPlan;
  readonly options?: Partial<{
    readonly includeTimeline: boolean;
    readonly includeTrace: boolean;
  }>;
}

const riskBucket = (risk: number): ConstellationPolicyInsight['status'] =>
  risk > 0.8 ? 'critical' : risk > 0.5 ? 'warning' : 'ok';

const asTenantId = (tenant: string): ConstellationTenant => `tenant:${tenant}` as ConstellationTenant;

const asTenantSlug = (tenant: string): `tenant:${string}` => `tenant:${tenant}`;

const toDependencyStageId = (commandId: string): ConstellationStageId => `cmd:${commandId}` as ConstellationStageId;

export const createRuntimeSummary = (
  plan: ConstellationOrchestrationPlan,
  result: ConstellationExecutionResult,
): ConstellationSummary => {
  const timeline = normalizeTelemetry(
    result.stages.flatMap((stage) => [
      {
        at: new Date().toISOString(),
        stage: stage.id,
        risk: stage.commandIds.length / Math.max(plan.commands.length, 1),
        signal: {
          key: `risk.${stage.id}`,
          value: stage.commandIds.length,
          confidence: 0.94,
        },
      },
    ]),
  ).map((point) => ({
    phase: point.signal.key,
    timestamp: point.at,
    risk: point.risk,
    tags: [point.signal.key, point.signal.key.endsWith('0') ? 'low' : 'high'],
  }));

  return {
    title: `${plan.title} (${plan.id})`,
    totalArtifacts: result.artifacts.length,
    highRisk: isHighRiskPlan(plan),
    timeline: timeline satisfies readonly ConstellationTimelinePoint[],
  };
};

export const toPolicyInsights = (plan: ConstellationOrchestrationPlan): readonly ConstellationPolicyInsight[] =>
  plan.stages
    .map((stage) => ({
      key: stage.id,
      score: stage.commandIds.length / Math.max(1, plan.commands.length),
      status: riskBucket(stage.commandIds.length / Math.max(1, plan.commands.length)),
    }))
    .sort((left, right) => right.score - left.score);

export const mapPanelState = (plan: ConstellationOrchestrationPlan): ConstellationPanelState => ({
  planId: plan.id,
  mode: plan.phase === 'plan' ? 'detailed' : 'compact',
  runCount: plan.commands.length,
});

export const runConstellation = async ({ tenant, plan, options = {} }: ConstellationRuntimeInput): Promise<ConstellationServiceResult> => {
  const input = {
    tenant: asTenantId(tenant),
    plan,
  } satisfies ConstellationOrchestratorInput;

  const output = await runConstellationOrchestrator(input);
  const dependencyMap = Object.fromEntries(
    plan.stages.map((stage) => [stage.id, stage.commandIds.map(toDependencyStageId)]),
  ) as Record<string, readonly ConstellationStageId[]>;
  const graph = buildConstellationGraph(plan.stages, dependencyMap);
  const runtime = renderGraphRuntime(plan, {
    strict: true,
    maxHops: options.includeTimeline ? 8 : 4,
  });

  void graph;
  void runtime;

  const outputSummary = createRuntimeSummary(plan, {
    ...output.result,
    plans: [...output.result.plans],
  }) satisfies ConstellationSummary;

  return {
    summary: outputSummary,
    plan,
    result: output.result,
    signals: output.signals.map((signal) => ({
      ...signal,
      payload: {
        ...signal.payload,
        tenantSlug: asTenantSlug(tenant),
      },
    })),
    trace: options.includeTrace ? output.trace : [],
  };
};
