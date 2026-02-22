import { z } from 'zod';
import { ok, err, Result } from '@shared/result';
import { createEngine } from '@service/adaptive-ops-runner';
import {
  AdaptiveRunStore,
  AdaptiveRunStoreAdapter,
  AdaptiveRunStoreAdapterImpl,
  InMemoryAdaptiveRunStore,
} from '@data/adaptive-ops-store';
import {
  AdaptivePolicy,
  AdaptiveDecision,
  AdaptiveRun,
  AdaptiveAction,
  PolicyId,
  SignalKind,
  SignalSample,
} from '@domain/adaptive-ops';
import {
  HealthSnapshot,
  RunForecast,
  SignalDigest,
  PolicyGraphNode,
  buildCoverageReport,
  makeWindowId,
  emptyHealthSignal,
  inferPolicyGraph,
  summarizeSignals,
  mergeForecasts,
  buildForecast,
  parseForecastInput,
} from '@domain/adaptive-ops-metrics';
import { CommandInput, CommandMetrics, CommandPlan, CommandResult } from './types';
import { summarizeDecisions } from './insights';

const commandInputSchema = z.object({
  tenantId: z.string().min(1),
  windowMs: z.number().positive(),
  policies: z.number().int().min(0),
  dryRun: z.boolean(),
  maxActions: z.number().int().positive().max(20),
});

const commandForecastSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  horizonMinutes: z.number().int().positive(),
  maxPoints: z.number().int().positive().max(48).optional(),
});

export interface OrchestratorDependencies {
  store: AdaptiveRunStore;
}

export interface OrchestratorSummary {
  run: AdaptiveRun | null;
  plan: CommandPlan;
  metrics: CommandMetrics;
  profile: HealthSnapshot;
}

export interface ForecastInput {
  tenantId: string;
  runId: string;
  horizonMinutes: number;
  maxPoints?: number;
}

const createFallbackPolicy = (tenantId: string): AdaptivePolicy => ({
  id: tenantId as PolicyId,
  tenantId: tenantId as never,
  name: 'orchestrator-fallback',
  active: true,
  dependencies: [],
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date().toISOString(),
    zone: 'utc',
  },
  allowedSignalKinds: ['manual-flag'],
});

const syntheticSignals = (run: AdaptiveRun): readonly SignalSample[] => {
  return run.decisions.flatMap((decision) =>
    decision.selectedActions.flatMap((action) =>
      action.targets.map((target) => ({
        kind: 'manual-flag' as SignalKind,
        value: action.intensity,
        unit: target,
        at: run.updatedAt,
      })),
    ),
  );
};

const buildMockPolicies = (run: AdaptiveRun, tenantId: string): readonly AdaptivePolicy[] =>
  run.decisions.map((decision) => ({
    id: decision.policyId,
    tenantId: tenantId as never,
    name: decision.policyId,
    active: true,
    dependencies: [],
    window: run.serviceWindow,
    allowedSignalKinds: ['manual-flag'] as readonly SignalKind[],
  }));

const buildSignals = (run: AdaptiveRun): readonly SignalSample[] => syntheticSignals(run);

const toSignalDigests = (run: AdaptiveRun): readonly SignalDigest[] => summarizeSignals(buildSignals(run));

const createHealthSnapshot = (tenantId: string, run: AdaptiveRun | null): HealthSnapshot => {
  if (!run) {
    return emptyHealthSignal(tenantId, `${tenantId}:no-run`);
  }

  const policies = buildMockPolicies(run, tenantId);
  const report = buildCoverageReport(tenantId, policies, run.decisions);
  const score = policies.length === 0 ? 0 : Math.min(1, report.summary.totalDecisions / (policies.length * 2));

  return {
    tenantId,
    runId: run.incidentId,
    score,
    riskTier: score >= 0.7 ? 'critical' : score >= 0.4 ? 'attention' : 'safe',
    details: `policies=${report.summary.totalPolicies}, conflicts=${report.summary.conflictCount}`,
  };
};

const toPlan = (
  input: CommandInput,
  run: AdaptiveRun,
  decisions: readonly AdaptiveDecision[],
  filteredPolicies: readonly AdaptivePolicy[],
  policyGraph: readonly PolicyGraphNode[],
): CommandPlan => {
  const runActions = decisions.flatMap((decision) => decision.selectedActions);
  const candidateActions = [...runActions].sort((left, right) => right.intensity - left.intensity);

  return {
    tenantId: input.tenantId,
    requestedWindowMs: input.windowMs,
    filteredPolicies,
    activePolicies: filteredPolicies,
    candidateActions,
    decisions,
    topAction: candidateActions[0] ?? null,
    runId: run.incidentId,
    policyGraph,
    signalDigests: toSignalDigests(run),
  };
};

export class AdaptiveOpsOrchestrator {
  private readonly engine = createEngine();

  constructor(
    private readonly storeAdapter: AdaptiveRunStoreAdapter,
    private readonly fallbackPolicyFactory: (tenantId: string) => AdaptivePolicy[],
  ) {}

  static create(dependencies?: Partial<OrchestratorDependencies>): AdaptiveOpsOrchestrator {
    const baseStore = dependencies?.store ?? new InMemoryAdaptiveRunStore();
    const adapter = new AdaptiveRunStoreAdapterImpl(baseStore);
    return new AdaptiveOpsOrchestrator(adapter, (tenantId) => [createFallbackPolicy(tenantId)]);
  }

  async execute(input: CommandInput): Promise<CommandResult> {
    const parsed = commandInputSchema.safeParse({
      tenantId: input.tenantId,
      windowMs: input.windowMs,
      policies: input.policies.length,
      dryRun: input.dryRun,
      maxActions: input.maxActions,
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.message,
        plan: this.emptyPlan(input),
        metrics: this.emptyMetrics(input),
      };
    }

    const activePolicies =
      input.policies.length > 0 ? input.policies.filter((policy) => policy.active) : this.fallbackPolicyFactory(input.tenantId);

    const runResult = await this.engine.execute({
      context: {
        tenantId: input.tenantId,
        signalWindowSec: Math.floor(input.windowMs / 1000),
        policies: activePolicies,
      },
      signals: input.signals,
    });

    if (!runResult.ok) {
      return {
        ok: false,
        error: runResult.error,
        plan: {
          ...this.emptyPlan(input),
          activePolicies,
          filteredPolicies: input.policies,
          policyGraph: inferPolicyGraph(activePolicies),
        },
        metrics: this.emptyMetrics(input),
      };
    }

    const run = runResult.value.run;
    const decisions = runResult.value.decisions;
    const policyGraph = inferPolicyGraph(activePolicies);
    const coverage = buildCoverageReport(input.tenantId, activePolicies, decisions);

    const plan = {
      ...toPlan(input, run, decisions, input.policies, policyGraph),
      healthSignals: coverage.hotspots,
    };

    if (!input.dryRun) {
      await this.storeAdapter.save(run);
    }

    return {
      ok: true,
      error: null,
      plan,
      metrics: this.collectMetrics(input, decisions, coverage.hotspots.length),
    };
  }

  async summarize(input: CommandInput): Promise<Result<OrchestratorSummary, string>> {
    const result = await this.execute(input);
    if (!result.ok) {
      return err(result.error ?? 'execute failed');
    }

    const profile = createHealthSnapshot(input.tenantId, await this.findRunById(result.plan.runId));
    return ok({
      run: null,
      plan: result.plan,
      metrics: result.metrics,
      profile,
    });
  }

  async forecast(input: ForecastInput): Promise<Result<RunForecast, string>> {
    const parsed = commandForecastSchema.parse(input);
    const response = await this.storeAdapter.list({ tenantId: input.tenantId as never });
    const latest = response.rows.at(-1)?.run;
    if (!latest) return err(`No run history for tenant ${input.tenantId}`);

    const maxPoints = parsed.maxPoints ?? 12;
    const policies = buildMockPolicies(latest, input.tenantId);
    const signals = buildSignals(latest);
    const base = buildForecast(
      {
        tenantId: input.tenantId,
        window: {
          id: makeWindowId(input.tenantId),
          tenantId: input.tenantId,
          windowStart: latest.createdAt,
          windowEnd: latest.updatedAt,
          zone: latest.serviceWindow.zone,
          policyCount: policies.length,
          activePolicyCount: policies.length,
          signalCount: signals.length,
        },
        policies,
        signals,
        history: [latest],
      },
      {
        runId: parsed.runId,
        tenantId: parsed.tenantId,
        horizonMinutes: parsed.horizonMinutes,
        maxPoints,
      },
    );

    const fallbackInput = parseForecastInput({
      runId: parsed.runId,
      tenantId: parsed.tenantId,
      horizonMinutes: 30,
      maxPoints,
    });

    const fallback = buildForecast(
      {
        tenantId: input.tenantId,
        window: {
          id: makeWindowId(input.tenantId),
          tenantId: input.tenantId,
          windowStart: latest.createdAt,
          windowEnd: latest.updatedAt,
          zone: latest.serviceWindow.zone,
          policyCount: policies.length,
          activePolicyCount: policies.length,
          signalCount: signals.length,
        },
        policies,
        signals,
        history: [latest],
      },
      fallbackInput,
      { intervalMinutes: 10, noiseBand: 0.1, defaultRecoveryMinutes: 24 },
    );

    return ok(mergeForecasts(base, fallback));
  }

  async loadHistory(tenantId: string): Promise<readonly AdaptiveRun[]> {
    const response = await this.storeAdapter.list({ tenantId: tenantId as never });
    return response.rows.map((row) => row.run);
  }

  private async findRunById(runId: string | null): Promise<AdaptiveRun | null> {
    if (!runId) return null;
    const response = await this.storeAdapter.list({});
    const match = response.rows.find((row) => row.run.incidentId === runId);
    return match?.run ?? null;
  }

  private emptyPlan(input: CommandInput): CommandPlan {
    return {
      tenantId: input.tenantId,
      requestedWindowMs: input.windowMs,
      filteredPolicies: [],
      activePolicies: [],
      candidateActions: [],
      decisions: [],
      topAction: null,
      runId: null,
      policyGraph: [],
      healthSignals: [],
      signalDigests: [],
    };
  }

  private emptyMetrics(input: CommandInput): CommandMetrics {
    return {
      signalKinds: [],
      policyCount: input.policies.length,
      actionCount: 0,
      topConfidence: 0,
      avgConfidence: 0,
      uniqueSignalKinds: 0,
      healthSignalCount: 0,
    };
  }

  private collectMetrics(
    input: CommandInput,
    decisions: readonly AdaptiveDecision[],
    healthSignalCount: number,
  ): CommandMetrics {
    const summary = summarizeDecisions(input.tenantId, input.policies, decisions);
    const uniqueSignals = new Set(summary.signalKinds);
    const actionCount = decisions.reduce((acc, decision) => acc + decision.selectedActions.length, 0);
    const confidence = decisions.reduce((acc, decision) => acc + decision.confidence, 0) / Math.max(1, decisions.length);

    return {
      signalKinds: Array.from(uniqueSignals.values()),
      policyCount: input.policies.length,
      actionCount,
      topConfidence: decisions[0]?.confidence ?? 0,
      avgConfidence: confidence,
      uniqueSignalKinds: uniqueSignals.size,
      healthSignalCount,
    };
  }
}

export type OrchestratorExecuteResult = Awaited<ReturnType<AdaptiveOpsOrchestrator['execute']>>;
