import type { RecoveryServiceTopology, StabilitySignal, StabilityRunId, WindowRank } from './models';

export interface SignalSample {
  readonly signal: StabilitySignal;
  readonly ratioToThreshold: number;
}

export interface SignalAggregation {
  readonly runId: StabilityRunId;
  readonly byWindow: WindowRank;
  readonly byClass: Record<StabilitySignal['alertClass'], number>;
  readonly byService: Record<string, number>;
}

export const aggregateSignalsByRun = (
  runId: StabilityRunId,
  signals: ReadonlyArray<StabilitySignal>,
): SignalAggregation => {
  const byWindow = { p1m: 0, p5m: 0, p15m: 0, p1h: 0, p6h: 0 } satisfies WindowRank;
  const byClass: Record<StabilitySignal['alertClass'], number> = {
    capacity: 0,
    latency: 0,
    'error-rate': 0,
    'integration-failure': 0,
    'dependency-outage': 0,
  };
  const byService: Record<string, number> = {};

  for (const signal of signals) {
    if (signal.runId !== runId) continue;

    byWindow[signal.window] += signal.value;
    byClass[signal.alertClass] += 1;
    byService[signal.serviceId] = (byService[signal.serviceId] ?? 0) + 1;
  }

  return {
    runId,
    byWindow,
    byClass,
    byService,
  };
};

export const scoreSamples = (samples: ReadonlyArray<SignalSample>): number => {
  if (samples.length === 0) return 100;
  const scoreTotal = samples.reduce((sum, item) => {
    return sum + item.signal.threshold > 0
      ? 100 - Math.min(100, Math.max(0, (item.signal.value / item.signal.threshold) * 100))
      : 100;
  }, 0);

  return Math.max(0, Math.round(scoreTotal / samples.length));
};

export const listCriticalEdges = (
  topology: RecoveryServiceTopology,
  limit: number,
): RecoveryServiceTopology['edges'] => {
  return topology.edges
    .slice()
    .sort((a, b) => b.coupling - a.coupling)
    .slice(0, Math.max(1, Math.min(limit, topology.edges.length)));
};
