import { summarizeEvents, toTimelineSeries } from './telemetry';
import { runIntelligencePlan, RecoveryLabIntelligenceService, type ServiceRequest } from './service';
import {
  type StrategyMode,
  type StrategyLane,
  type SignalEvent,
  type StrategyTuple,
  type StrategyPlan,
  type StrategyResult,
} from './types';
import { parseStrategyTuple } from './schema';

export interface OperationPlan {
  readonly title: string;
  readonly plan: StrategyPlan;
  readonly tuple: StrategyTuple;
}

export interface OperationRun<TOutput = unknown> {
  readonly request: ServiceRequest<Record<string, unknown>>;
  readonly telemetry: readonly SignalEvent[];
  readonly result: StrategyResult<TOutput>;
  readonly plan: StrategyPlan;
  readonly timing: {
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly durationMs: number;
  };
}

export interface StrategyOperationsParams {
  readonly workspace: string;
  readonly scenario: string;
  readonly lane: StrategyLane;
  readonly mode: StrategyMode;
  readonly seed: Record<string, unknown>;
  readonly phases?: readonly StrategyTuple[];
}

export const createOperationPlan = async (params: StrategyOperationsParams): Promise<OperationPlan> => {
  const service = new RecoveryLabIntelligenceService();
  const tuple = parseStrategyTuple([params.mode, params.lane, 'op', 1]);
  const plan = await service.buildPlan({
    workspace: params.workspace,
    scenario: params.scenario,
    mode: params.mode,
    lane: params.lane,
    seed: params.seed,
    tuple,
  });
  return {
    title: `${params.scenario} / ${params.mode} / ${params.lane}`,
    plan,
    tuple,
  };
};

export const runStrategyOperation = async <TOutput = unknown>(
  params: StrategyOperationsParams,
): Promise<OperationRun<TOutput>> => {
  const startedAt = new Date().toISOString();
  const request: ServiceRequest<Record<string, unknown>> = {
    workspace: params.workspace,
    scenario: params.scenario,
    mode: params.mode,
    lane: params.lane,
    seed: params.seed,
    tuple: parseStrategyTuple([params.mode, params.lane, 'run', 2]),
  };

  const response = await runIntelligencePlan(request);
  const finishedAt = new Date().toISOString();
  const summary = summarizeEvents(response.result.events);
  const telemetry = response.result.events.toSorted((left, right) => left.at.localeCompare(right.at));
  const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);

  return {
    request,
    telemetry,
    result: response.result as StrategyResult<TOutput>,
    plan: response.plan,
    timing: {
      startedAt,
      finishedAt,
      durationMs,
    },
  };
};

export const collectOperationMetrics = (runs: readonly OperationRun[]): {
  readonly averageScore: number;
  readonly totalWarnings: number;
  readonly totalErrors: number;
  readonly totalCritical: number;
  readonly eventTimeline: readonly { readonly at: number; readonly count: number; readonly mode: StrategyMode }[];
} => {
  if (runs.length === 0) {
    return {
      averageScore: 0,
      totalWarnings: 0,
      totalErrors: 0,
      totalCritical: 0,
      eventTimeline: [],
    };
  }

  const scores = runs.map((run) => run.result.score);
  const totalWarnings = runs.reduce((acc, run) => acc + run.result.warnings.length, 0);
  const eventGroups = runs.flatMap((run) => run.result.events);
  const summary = summarizeEvents(eventGroups);
  const eventTimeline = toTimelineSeries(eventGroups);

  return {
    averageScore: Number((scores.reduce((acc, score) => acc + score, 0) / scores.length).toFixed(4)),
    totalWarnings,
    totalErrors: summary.errors,
    totalCritical: summary.criticial,
    eventTimeline,
  };
};

export const planSequence = async (params: StrategyOperationsParams, repeats = 3): Promise<readonly OperationRun[]> => {
  const runs: OperationRun[] = [];
  for (let index = 0; index < repeats; index += 1) {
    const run = await runStrategyOperation({
      workspace: params.workspace,
      scenario: `${params.scenario}-${index}`,
      lane: params.lane,
      mode: params.mode,
      seed: {
        ...params.seed,
        index,
      },
    });
    runs.push(run);
  }
  return runs;
};

export const runLanes = async (scenario: string, workspace: string): Promise<readonly OperationPlan[]> => {
  const lanes = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;
  const modes = ['simulate', 'analyze', 'stress', 'plan', 'synthesize'] as const;
  const plans: OperationPlan[] = [];

  for (const lane of lanes) {
    for (const mode of modes) {
      const tuple = parseStrategyTuple([mode, lane, 'multi', 3]);
      const plan = await createOperationPlan({
        workspace,
        scenario,
        lane,
        mode,
        seed: { lane, mode, scenario },
      });
      plans.push(plan);
      if (plans.length > 2) {
        plans.forEach((entry, idx) => {
          void entry;
          void idx;
        });
      }
    }
  }

  return plans;
};
