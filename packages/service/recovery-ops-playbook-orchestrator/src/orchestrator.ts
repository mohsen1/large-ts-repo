import { fail, ok, type Result } from '@shared/result';
import {
  buildExecutionPlan,
  canBlueprintRun,
  parsePlaybookBlueprint,
  parsePlaybookRun,
  summarizePlan,
} from '@domain/recovery-ops-playbook';
import { scoreQuality, buildProgressTimeline } from './analytics';
import { runSimulation } from './simulator';
import {
  OrchestrationEvent,
  OrchestrationPlanBundle,
  OrchestratorQuery,
  OrchestrationSnapshot,
  OrchestrationTrace,
  OrchestratorAdapter,
  OrchestrationStore,
  OrchestrationId,
} from './types';
import type { PlaybookExecutionPlan, PlaybookRun, PlaybookStepId } from '@domain/recovery-ops-playbook';

export interface OrchestrationPlan {
  readonly plan: PlaybookExecutionPlan;
  readonly events: readonly OrchestrationEvent[];
}

const defaultMergeConfig = {
  preferParallelism: true,
  maxParallelSteps: 3,
  autoEscalate: true,
  rollbackPolicy: {
    enabled: true,
    maxLatencyMinutes: 120,
    requiresApproval: true,
  },
} as const;

const policyDefaults = {
  enableAutoApproval: false,
  minConfidence: 0.7,
} as const;

const makeTrace = (type: OrchestrationEvent['type'], runId: string, details: string): OrchestrationTrace => ({
  action: type,
  timestamp: new Date().toISOString(),
  metadata: { type, runId, details },
});

export const buildPlanBundle = (blueprintPayload: unknown, runPayload: unknown): OrchestrationPlanBundle => {
  const blueprint = parsePlaybookBlueprint(blueprintPayload);
  const run = parsePlaybookRun(runPayload);

  const checks = canBlueprintRun(blueprint, {
    service: blueprint.service,
    timeBudgetMinutes: 300,
    activeWorkload: 10,
    riskTier: blueprint.tier,
  });

  if (!checks.ok) {
    throw new Error(checks.violations.map((item) => item.message).join('; '));
  }

  const plan = buildExecutionPlan(blueprint, {
    playbookId: blueprint.id,
    activeRun: run,
    planConfig: {
      ...defaultMergeConfig,
      rollbackPolicy: {
        enabled: defaultMergeConfig.rollbackPolicy.enabled,
        maxLatencyMinutes: defaultMergeConfig.rollbackPolicy.maxLatencyMinutes,
        requiresApproval: defaultMergeConfig.rollbackPolicy.requiresApproval,
      },
    },
  });

  return {
    plan,
    planConfig: {
      preferParallelism: defaultMergeConfig.preferParallelism,
      maxParallelSteps: defaultMergeConfig.maxParallelSteps,
      autoEscalate: defaultMergeConfig.autoEscalate,
      rollbackPolicy: {
        enabled: defaultMergeConfig.rollbackPolicy.enabled,
        maxLatencyMinutes: defaultMergeConfig.rollbackPolicy.maxLatencyMinutes,
        requiresApproval: defaultMergeConfig.rollbackPolicy.requiresApproval,
      },
    },
    events: [
      {
        type: 'plan-built',
        ts: new Date().toISOString(),
        runId: run.id,
        details: 'Plan built with deterministic constraints',
      },
    ],
    signals: [],
    readyForApproval: scoreQuality([]).normalized >= policyDefaults.minConfidence,
  };
};

export const executeBundle = async (
  bundle: OrchestrationPlanBundle,
  adapter: OrchestratorAdapter,
  store: OrchestrationStore,
): Promise<Result<OrchestrationSnapshot, Error>> => {
  const run = bundle.plan.runbook;
  const simulation = runSimulation({
    plan: bundle.plan,
    run,
    context: {
      seed: run.id.length,
      allowRetry: true,
      jitterMs: 120,
    },
  });

  await store.saveTrace(makeTrace('run-updated', run.id, 'Simulation complete'));
  await store.saveRun({
    ...run,
    notes: [...run.notes, `simulation-latency=${simulation.metrics.totalLatencyMs}`],
  });

  const commandResult = await adapter.executeCommand({
    type: simulation.metrics.failureCount > 0 ? 'pause' : 'resume',
    runId: run.id,
    reason: simulation.metrics.failureCount > 0 ? 'simulation-failures' : 'simulation-pass',
    actor: 'orchestrator',
  });

  if (!commandResult.ok) {
    return fail(commandResult.error);
  }

  if (!bundle.readyForApproval && policyDefaults.enableAutoApproval) {
    return fail(new Error('Manual approval required'));
  }

  const summary = summarizePlan(bundle.plan);
  const qualityWindows = buildProgressTimeline(bundle.plan.order.map((stepId) => ({
    stepId: `${stepId}`,
    startedAt: new Date().toISOString(),
    progress: 1,
    latencyMs: 1200,
  })));
  const quality = scoreQuality(qualityWindows);

  return ok({
    orchestrationId: `orch-${run.id}` as OrchestrationId,
    playbookId: bundle.plan.runbook.playbookId,
    run,
    projection: {
      playbookId: run.playbookId,
      runId: run.id,
      activeStep: bundle.plan.order[0] ?? null,
      completedSteps: bundle.plan.order.filter((stepId) => run.outcomeByStep[stepId]?.status === 'passed'),
      failedSteps: bundle.plan.order.filter((stepId) => run.outcomeByStep[stepId]?.status === 'failed'),
      confidence: quality.normalized,
    },
    trace: [
      makeTrace('run-updated', run.id, `Simulation complete completion=${summary.completionRatio}`),
    ],
  });
};

export const listByQuery = async (
  query: OrchestratorQuery,
  store: OrchestrationStore,
): Promise<PlaybookRun[]> => {
  const run = await store.getRun(query.requestId as string);
  if (!run) {
    return [];
  }

  if (!query.includeDrafts && run.status === 'draft') {
    return [];
  }

  return [run];
};

export const preparePlan = (runId = 'fallback-run-id'): OrchestrationPlan => {
  const now = new Date().toISOString();

  const plan: PlaybookExecutionPlan = {
    runbook: {
      id: runId as any,
      playbookId: `${runId}-blueprint` as any,
      triggeredBy: 'system',
      startedAt: now,
      window: { startAt: now, endAt: now, timezone: 'UTC' },
      status: 'draft',
      outcomeByStep: {},
      notes: [],
    },
    order: [],
    riskProfile: { minor: 0, major: 0, catastrophic: 0 },
    merged: {
      preferParallelism: defaultMergeConfig.preferParallelism,
      maxParallelSteps: defaultMergeConfig.maxParallelSteps,
      autoEscalate: defaultMergeConfig.autoEscalate,
      rollbackPolicy: {
        enabled: defaultMergeConfig.rollbackPolicy.enabled,
        maxLatencyMinutes: defaultMergeConfig.rollbackPolicy.maxLatencyMinutes,
        requiresApproval: defaultMergeConfig.rollbackPolicy.requiresApproval,
      },
    },
  };

  return {
    plan,
    events: [
      {
        type: 'plan-built',
        ts: now,
        runId,
        details: `fallback-plan-${runId}`,
      },
    ],
  };
};
