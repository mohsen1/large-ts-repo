import { collectIterable, mapIterable, reduceAsyncIterable, collectAsyncIterable, type IteratorStep } from '@shared/stress-lab-runtime';
import {
  type WorkflowExecutionResult,
  type WorkflowExecutionTrace,
  type WorkflowExecutionStage,
  type WorkflowWorkspaceSeed,
  type RecoverySignal,
  type WorkloadTarget,
} from './advanced-workflow-models';

export interface WorkflowRenderStage {
  readonly stage: string;
  readonly phase: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'warn' | 'error';
}

export interface WorkflowRenderModel {
  readonly runId: string;
  readonly tenantId: string;
  readonly stageRows: readonly WorkflowRenderStage[];
  readonly signalCount: number;
  readonly runbookCount: number;
  readonly riskBands: readonly { readonly key: string; readonly count: number }[];
  readonly recommendations: readonly string[];
}

type GroupedSignals = {
  [K in RecoverySignal['class']]: {
    readonly className: K;
    readonly total: number;
    readonly samples: readonly string[];
  };
};

export type StageRecord<T extends readonly WorkflowExecutionStage[]> = {
  [K in keyof T]: T[K] extends { stage: infer Stage }
    ? Stage extends string
      ? { readonly stage: Stage; readonly startedAt: string; readonly durationMs: number }
      : never
    : never;
};

const emptyWorkspace = {
  tenantId: 'tenant:unknown',
  runbooks: [],
  signals: [],
  targets: [],
  requestedBand: 'low',
  mode: 'adaptive',
} as unknown as WorkflowWorkspaceSeed;

export const mapWorkspaceSignals = (signals: readonly RecoverySignal[]): readonly { className: string; total: number; samples: readonly string[] }[] => {
  const byClass = new Map<RecoverySignal['class'], readonly string[]>();
  for (const signal of signals) {
    const bucket = byClass.get(signal.class) ?? [];
    byClass.set(signal.class, [...bucket, signal.id]);
  }
  return collectIterable(byClass.entries()).map(([className, ids]) => ({
    className,
    total: ids.length,
    samples: ids.slice(0, 3),
  }));
};

export const buildWorkspaceTargetTuples = (targets: readonly WorkloadTarget[]) => {
  if (targets.length === 0) {
    return [] as []; 
  }
  return [targets[0] as WorkloadTarget, ...targets.slice(1)] as readonly [WorkloadTarget, ...WorkloadTarget[]];
};

export const toRenderStageRows = (stages: readonly WorkflowExecutionStage[]): readonly WorkflowRenderStage[] =>
  collectIterable(
    mapIterable(stages, (stage) => ({
      stage: stage.stage,
      phase: stage.route,
      durationMs: stage.elapsedMs,
      status: stage.elapsedMs > 100 ? 'warn' : 'ok',
    })),
  );

export const toRenderModel = (result: WorkflowExecutionResult): WorkflowRenderModel => {
  const stageRows = toRenderStageRows(result.stages);
  const riskBands = mapWorkspaceSignals(result.workspace.signals).map((bucket) => ({
    key: bucket.className,
    count: bucket.total,
  }));

  return {
    runId: String(result.runId),
    tenantId: String(result.tenantId),
    stageRows,
    signalCount: result.workspace.signals.length,
    runbookCount: result.workspace.runbooks.length,
    riskBands,
    recommendations: result.recommendations,
  };
};

export const renderWorkspaceProfile = (workspace: WorkflowWorkspaceSeed): {
  readonly tenant: string;
  readonly targetCount: number;
  readonly runbookCount: number;
} => ({
  tenant: workspace.tenantId,
  targetCount: workspace.targets.length,
  runbookCount: workspace.runbooks.length,
});

export const toFlatTrace = (traces: readonly WorkflowExecutionTrace[]): readonly WorkflowExecutionTrace[] =>
  collectIterable(traces);

const toAsyncIterable = <T>(values: Iterable<T>): AsyncIterable<T> =>
  (async function* () {
    for (const value of values) {
      yield value;
    }
  })();

export const summarizeTraceByPlugin = async (traces: Iterable<WorkflowExecutionTrace>): Promise<Record<string, number>> => {
  const asyncTraces = await collectAsyncIterable(toAsyncIterable(traces));
  const total = await reduceAsyncIterable(
    toAsyncIterable(asyncTraces),
    new Map<string, number>(),
    async (state, entry, _index) => {
      const key = `${entry.stage}::${entry.pluginId}`;
      const next = state.get(key) ?? 0;
      state.set(key, next + 1);
      return state;
    },
  );

  const output: Record<string, number> = {};
  for (const [key, value] of total) {
    output[key] = value;
  }
  return output;
};

export const mapStageSequence = <TSeed extends readonly WorkflowExecutionStage[]>(
  stages: TSeed,
): StageRecord<TSeed> => {
  return collectIterable(
    mapIterable(stages, (entry) => ({
      stage: entry.stage,
      startedAt: entry.startedAt,
      durationMs: entry.elapsedMs,
    })),
  ) as StageRecord<TSeed>;
};

export const toWorkspaceTargetsTuple = (targets: readonly WorkloadTarget[]) =>
  buildWorkspaceTargetTuples(targets);

export const summarizeBySignalClass = (
  signals: readonly RecoverySignal[],
): GroupedSignals => {
  const grouped: GroupedSignals = {
    availability: { className: 'availability', total: 0, samples: [] },
    integrity: { className: 'integrity', total: 0, samples: [] },
    performance: { className: 'performance', total: 0, samples: [] },
    compliance: { className: 'compliance', total: 0, samples: [] },
  };

  for (const signal of signals) {
    if (signal.class === 'availability') {
      const prior = grouped.availability;
      grouped.availability = {
        className: 'availability',
        total: prior.total + 1,
        samples: [...prior.samples, signal.id].slice(0, 3),
      };
      continue;
    }

    if (signal.class === 'integrity') {
      const prior = grouped.integrity;
      grouped.integrity = {
        className: 'integrity',
        total: prior.total + 1,
        samples: [...prior.samples, signal.id].slice(0, 3),
      };
      continue;
    }

    if (signal.class === 'performance') {
      const prior = grouped.performance;
      grouped.performance = {
        className: 'performance',
        total: prior.total + 1,
        samples: [...prior.samples, signal.id].slice(0, 3),
      };
      continue;
    }

    const prior = grouped.compliance;
    grouped.compliance = {
      className: 'compliance',
      total: prior.total + 1,
      samples: [...prior.samples, signal.id].slice(0, 3),
    };
  }

  return grouped;
};
