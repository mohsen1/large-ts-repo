import { PolicyStoreArtifact, PolicyStoreRunRecord } from './types';

export interface StoreMetric {
  name: string;
  value: number;
  unit: 'count' | 'ratio' | 'ms' | 'percent';
  dimensions: Record<string, string>;
}

export interface StoreSummary {
  totalArtifacts: number;
  activeArtifacts: number;
  archivedArtifacts: number;
  runRateSuccess: number;
  medianRunLatencyMs: number;
}

const percentile = (values: readonly number[], ratio: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio));
  return sorted[index];
};

export const summarizeArtifacts = (items: readonly PolicyStoreArtifact[]): StoreSummary => {
  const total = items.length;
  const active = items.filter((item) => item.state === 'active').length;
  const archived = items.filter((item) => item.state === 'archived').length;
  const runRateSuccess = total === 0 ? 0 : Math.round((active / total) * 10000) / 100;
  return {
    totalArtifacts: total,
    activeArtifacts: active,
    archivedArtifacts: archived,
    runRateSuccess,
    medianRunLatencyMs: 0,
  };
};

export const summarizeRuns = (runs: readonly PolicyStoreRunRecord[]): StoreSummary => {
  const successful = runs.filter((run) => run.status === 'succeeded');
  const latencies = runs
    .map((entry) => Number(entry.metrics?.['elapsedMs']))
    .filter((value) => Number.isFinite(value));

  return {
    totalArtifacts: runs.length,
    activeArtifacts: successful.length,
    archivedArtifacts: runs.length - successful.length,
    runRateSuccess: runs.length === 0 ? 0 : Number((successful.length / runs.length).toFixed(4)) * 100,
    medianRunLatencyMs: percentile(latencies, 0.5),
  };
};

export const emitStoreMetrics = (artifacts: readonly PolicyStoreArtifact[], runs: readonly PolicyStoreRunRecord[]): StoreMetric[] => {
  const artifactSummary = summarizeArtifacts(artifacts);
  const runSummary = summarizeRuns(runs);
  return [
    { name: 'artifacts.total', value: artifactSummary.totalArtifacts, unit: 'count', dimensions: { type: 'artifact' } },
    { name: 'artifacts.active', value: artifactSummary.activeArtifacts, unit: 'count', dimensions: { type: 'artifact' } },
    { name: 'runs.successRate', value: runSummary.runRateSuccess, unit: 'percent', dimensions: { type: 'run' } },
    { name: 'runs.medianLatency', value: runSummary.medianRunLatencyMs, unit: 'ms', dimensions: { type: 'run' } },
  ];
};
