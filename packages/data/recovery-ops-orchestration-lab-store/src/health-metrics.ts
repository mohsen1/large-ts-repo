import type { LabRunRecord, OrchestrationLabRecord, StoreSummary } from './model';

export interface RunHealthMetric {
  readonly runId: LabRunRecord['runId'];
  readonly labId: LabRunRecord['labId'];
  readonly status: LabRunRecord['status'];
  readonly durationMinutes: number;
  readonly logDensity: number;
}

export interface LabHealthMetric {
  readonly labId: OrchestrationLabRecord['envelope']['lab']['id'];
  readonly signalCount: number;
  readonly planCount: number;
  readonly selectedPlanId?: OrchestrationLabRecord['selectedPlanId'];
  readonly runCount: number;
  readonly selectedRunRate: number;
  readonly avgLogCount: number;
}

export interface StoreHealthMetric {
  readonly generatedAt: string;
  readonly totalLabs: number;
  readonly totalRuns: number;
  readonly runHealth: readonly RunHealthMetric[];
  readonly labHealth: readonly LabHealthMetric[];
  readonly summary: {
    readonly healthyLabRatio: number;
    readonly runFailureRatio: number;
    readonly runPauseRatio: number;
  };
}

const parseDate = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toDuration = (run: LabRunRecord): number => {
  const started = parseDate(run.startedAt);
  const ended = parseDate(run.completedAt ?? run.startedAt);
  const duration = Math.max(0, ended - started);
  return Number((duration / 60000).toFixed(2));
};

const toDensity = (run: LabRunRecord): number => {
  if (run.logs.length === 0) {
    return 0;
  }
  const activeMinutes = toDuration(run);
  return Number((run.logs.length / Math.max(1, activeMinutes)).toFixed(2));
};

const labRunSuccess = (run: LabRunRecord): boolean => run.status === 'succeeded';

const labRunFailure = (run: LabRunRecord): boolean => run.status === 'failed';

const labRunPaused = (run: LabRunRecord): boolean => run.status === 'paused';

export const measureRunHealth = (runs: readonly LabRunRecord[]): readonly RunHealthMetric[] =>
  runs.map((run) => ({
    runId: run.runId,
    labId: run.labId,
    status: run.status,
    durationMinutes: toDuration(run),
    logDensity: toDensity(run),
  }));

export const measureLabHealth = (records: readonly OrchestrationLabRecord[]): readonly LabHealthMetric[] =>
  records.map((record) => {
    const labRuns = [] as LabRunRecord[];
    const runCount = labRuns.length;
    const successes = labRuns.filter(labRunSuccess).length;
    const avgLogCount = labRuns.length === 0 ? 0 : labRuns.reduce((acc, run) => acc + run.logs.length, 0) / labRuns.length;
    return {
      labId: record.envelope.lab.id,
      signalCount: record.envelope.lab.signals.length,
      planCount: record.envelope.plans.length,
      selectedPlanId: record.selectedPlanId,
      runCount,
      selectedRunRate: runCount === 0 ? 0 : successes / runCount,
      avgLogCount,
    };
  });

export const summarizeStoreHealth = (
  records: readonly OrchestrationLabRecord[],
  runs: readonly LabRunRecord[],
  summary: StoreSummary,
): StoreHealthMetric => {
  const measuredRuns = measureRunHealth(runs);
  const failures = measuredRuns.filter((run) => run.status === 'failed').length;
  const paused = measuredRuns.filter((run) => run.status === 'paused').length;

  const healthyLabs = records.filter((record) => record.envelope.plans.length > 0).length;
  const totalLabs = records.length || 1;

  return {
    generatedAt: new Date().toISOString(),
    totalLabs: records.length,
    totalRuns: runs.length,
    runHealth: measuredRuns,
    labHealth: measureLabHealth(records),
    summary: {
      healthyLabRatio: Number((healthyLabs / totalLabs).toFixed(3)),
      runFailureRatio: summary.totalRuns === 0 ? 0 : Number((failures / summary.totalRuns).toFixed(2)),
      runPauseRatio: summary.totalRuns === 0 ? 0 : Number((paused / summary.totalRuns).toFixed(2)),
    },
  };
};
