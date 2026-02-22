import { fail, ok, type Result } from '@shared/result';
import { runPipeline } from './pipeline';
import { RecoveryFusionOrchestrator } from './orchestrator';
import type { FusionPlanRequest } from '@domain/recovery-fusion-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { FusionServiceDeps, FusionCycleResult, FusionMetrics } from './types';
import type { FusionBundle } from '@domain/recovery-fusion-intelligence';

export interface BatchPlanRequest {
  readonly runId: RecoveryRunState['runId'];
  readonly plans: readonly FusionPlanRequest[];
}

export interface BatchPlanResult {
  readonly runId: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly cycleIds: readonly string[];
  readonly bundleIds: readonly string[];
  readonly reasons: readonly string[];
}

interface BatchPlanCoordinatorState {
  createdAt: string;
  completedAt?: string;
  totals: {
    accepted: number;
    rejected: number;
    failures: number;
  };
  runs: FusionCycleResult[];
}

export const validateBatch = (request: BatchPlanRequest): Result<void, string> => {
  if (!request.runId) {
    return fail('missing-run');
  }
  if (!request.plans.length) {
    return fail('empty-plan-list');
  }
  return ok(undefined);
};

const finalize = (state: BatchPlanCoordinatorState): BatchPlanResult => ({
  runId: String(state.runs[0]?.runId ?? 'unknown'),
  accepted: state.totals.accepted,
  rejected: state.totals.rejected,
  cycleIds: state.runs.map((cycle) => cycle.planId),
  bundleIds: state.runs.map((cycle) => cycle.bundleId),
  reasons: [
    `rejections:${state.totals.rejected}`,
    `failures:${state.totals.failures}`,
    `duration:${state.completedAt ? new Date(state.completedAt).getTime() - new Date(state.createdAt).getTime() : 0}`,
  ],
});

const mapPipelineBundle = (pipelineResult: { bundle: FusionBundle; metrics: FusionMetrics }) => {
  if (!pipelineResult?.bundle || !pipelineResult?.metrics) {
    return undefined;
  }
  return {
    bundleId: String(pipelineResult.bundle.id),
    metricBudget: pipelineResult.metrics.commandCount + pipelineResult.metrics.evaluationCount,
  };
};

export const runBatchPlans = async (
  request: BatchPlanRequest,
  deps: FusionServiceDeps,
): Promise<Result<BatchPlanResult, Error>> => {
  const valid = validateBatch(request);
  if (!valid.ok) {
    return fail(new Error(valid.error));
  }

  const started = new Date().toISOString();
  const state: BatchPlanCoordinatorState = {
    createdAt: started,
    totals: { accepted: 0, rejected: 0, failures: 0 },
    runs: [],
  };

  for (const plan of request.plans) {
    const runResult = await runPipeline(plan, deps);
    if (!runResult.ok) {
      state.totals.failures += 1;
      continue;
    }

    const orchestrator = new RecoveryFusionOrchestrator(deps);
    const cycle = await orchestrator.run(plan);
    if (!cycle.ok) {
      state.totals.rejected += 1;
      continue;
    }
    state.runs = [...state.runs, cycle.value];
    const pipelineBundle = mapPipelineBundle(runResult.value);
    if (pipelineBundle) {
      void pipelineBundle.bundleId;
    }
    if (cycle.value.accepted) {
      state.totals.accepted += 1;
    } else {
      state.totals.rejected += 1;
    }
  }

  state.completedAt = new Date().toISOString();
  return ok(finalize(state));
};

export const summarizeBatch = (result: BatchPlanResult): string =>
  `run=${result.runId}|accepted=${result.accepted}|rejected=${result.rejected}|cycles=${result.cycleIds.length}`;
