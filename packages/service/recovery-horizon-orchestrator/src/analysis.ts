import type { HorizonOrchestratorResult } from './types.js';
import type {
  HorizonSignal,
  PluginStage,
  JsonLike,
  HorizonPlan,
  PlanId,
  RunId,
} from '@domain/recovery-horizon-engine';
import type { TimelineNode } from '@domain/recovery-horizon-engine/temporal';
import { toTimelineNodes, walkTemporalNode } from '@domain/recovery-horizon-engine/temporal';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';

export type SignalTrend = {
  readonly stage: PluginStage;
  readonly count: number;
  readonly averageLagMs: number;
};

export type BlueprintTrend = {
  readonly planId: PlanId;
  readonly runId: RunId;
  readonly signalCount: number;
  readonly stageCount: number;
  readonly stageTrends: readonly SignalTrend[];
};

export type SignalTimeline = {
  readonly runId: string;
  readonly cursor: string;
  readonly nodes: readonly TimelineNode[];
};

const percent = (value: number, total: number) => (total === 0 ? 0 : (value / total) * 100);

export const summarizeSignals = (
  runId: RunId,
  signals: readonly HorizonSignal<PluginStage, JsonLike>[],
): Result<BlueprintTrend> => {
  if (!signals.length) {
    return err(new Error(`no signals for run ${runId}`));
  }

  const counts = signals.reduce<Record<PluginStage, number>>(
    (acc, signal) => {
      acc[signal.kind] = (acc[signal.kind] ?? 0) + 1;
      return acc;
    },
    {
      ingest: 0,
      analyze: 0,
      resolve: 0,
      optimize: 0,
      execute: 0,
    },
  );

  const stageTrends = (Object.entries(counts) as [PluginStage, number][]).map(([stage, count], order) => ({
    stage,
    count,
    averageLagMs: 120 + order * 12 + count,
  }));

  return ok({
    planId: signals[0].id as PlanId,
    runId,
    signalCount: signals.length,
    stageCount: stageTrends.length,
    stageTrends,
  });
};

export const summarizeRun = (result: HorizonOrchestratorResult): Readonly<{ readonly ok: boolean; readonly summary: string; readonly score: number }> => {
  const score = result.stages.reduce((acc, stage) => acc + (stage.ok ? 20 : 0), 0);
  return {
    ok: result.ok,
    summary: `run ${result.runId} with ${result.stages.length} stages: ${result.stages.map((stage) => stage.stage).join(',')}`,
    score,
  };
};

export const planSignalRatio = (signals: readonly HorizonSignal<PluginStage, JsonLike>[]) => {
  const grouped = signals.reduce<Record<string, number>>((acc, signal) => {
    const label = signal.kind;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const total = signals.length;
  return (Object.entries(grouped) as [PluginStage, number][]).map(([stage, count]) => ({
    stage,
    ratio: percent(count, total),
  }));
};

export const analyzeSignalSignals = async (
  input: { readonly tenantId: string; readonly runId: string; readonly stageWindow: readonly PluginStage[] },
  snapshot: {
    readonly tenantId: string;
    readonly state: { readonly runId: string; readonly stageWindow: readonly PluginStage[] };
    readonly latest: { readonly plans: readonly HorizonPlan[]; readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[] };
  },
): Promise<{
  readonly tenant: string;
  readonly runRatio: readonly { stage: PluginStage; ratio: number }[];
  readonly timeline: SignalTimeline;
  readonly countByWindow: number;
}> => {
  const signalRatio = planSignalRatio(snapshot.latest.signals);
  const timelineCursor = toTimelineNodes(snapshot.state.runId as RunId, snapshot.latest.signals);
  const nodes = [] as TimelineNode[];

  for await (const node of walkTemporalNode(timelineCursor)) {
    nodes.push(node);
  }

  return {
    tenant: input.tenantId,
    runRatio: signalRatio,
    timeline: {
      runId: snapshot.state.runId,
      cursor: `timeline:${snapshot.state.runId}`,
      nodes,
    },
    countByWindow: input.stageWindow.length,
  };
};

export const compareRuns = (
  left: Result<BlueprintTrend>,
  right: Result<BlueprintTrend>,
): { readonly improvement: number; readonly stable: boolean } => {
  if (!left.ok || !right.ok) {
    return { improvement: 0, stable: false };
  }

  const improvement = left.value.signalCount - right.value.signalCount;
  return { improvement, stable: improvement === 0 };
};

export const toPercentiles = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    count: sorted.length,
  };
};

export const estimateHealth = (result: HorizonOrchestratorResult): 'good' | 'warning' | 'degraded' => {
  if (!result.ok) {
    return 'degraded';
  }
  const stageRate = result.stages.every((stage) => stage.ok) ? 1 : 0;
  if (stageRate > 0.8) {
    return 'good';
  }
  return stageRate > 0.5 ? 'warning' : 'degraded';
};

export const mergeAnalyses = (
  left: ReturnType<typeof summarizeSignals>,
  right: ReturnType<typeof summarizeSignals>,
) => {
  if (!left.ok || !right.ok) {
    return err(new Error('missing analysis result'));
  }

  return ok({
    planId: right.value.planId,
    runId: right.value.runId,
    signalCount: left.value.signalCount + right.value.signalCount,
    stageCount: left.value.stageCount + right.value.stageCount,
    stageTrends: [...left.value.stageTrends, ...right.value.stageTrends],
  }) as Result<BlueprintTrend>;
};

export const analyzeSignalHistory = (
  runs: readonly ReturnType<typeof summarizeSignals>[],
): {
  readonly totalRuns: number;
  readonly maxSignals: number;
  readonly avgSignals: number;
  readonly health: 'good' | 'warning' | 'degraded';
} => {
  const totals = runs.filter((run) => run.ok).map((run) => run.value.signalCount);
  const maxSignals = totals.length ? Math.max(...totals) : 0;
  const avgSignals = totals.length ? totals.reduce((acc, value) => acc + value, 0) / totals.length : 0;
  const health = avgSignals > 5 ? 'good' : avgSignals > 1 ? 'warning' : 'degraded';
  return {
    totalRuns: runs.length,
    maxSignals,
    avgSignals,
    health,
  };
};

