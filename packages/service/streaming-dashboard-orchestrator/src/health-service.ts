import { streamSnapshotsToViews } from '@data/streaming-dashboard-store';
import { InMemoryStreamingDashboardRepository, queryDashboardSnapshots } from '@data/streaming-dashboard-store';
import { StreamHealthSignal } from '@domain/streaming-observability';

export interface HealthSummary {
  tenant: string;
  streamCount: number;
  critical: number;
  warnings: number;
  allSignals: number;
  throughputByStream: Record<string, number>;
}

export const buildHealthSummary = async (
  repository: InMemoryStreamingDashboardRepository,
  tenant: string,
): Promise<HealthSummary> => {
  const result = await queryDashboardSnapshots(repository, { tenant });
  const views = streamSnapshotsToViews(result.snapshots as any);
  let critical = 0;
  let warnings = 0;
  let allSignals = 0;
  const throughputByStream: Record<string, number> = {};
  for (const view of views) {
    allSignals += Number(view.alertsCount);
    throughputByStream[view.streamId] = view.throughputPerSecond;
    if (view.topologyHealthLabel === 'critical') critical += 1;
    if (view.topologyHealthLabel === 'warning') warnings += 1;
  }
  return {
    tenant,
    streamCount: result.total,
    critical,
    warnings,
    allSignals,
    throughputByStream,
  };
};

const bySignalLevel = (signals: readonly StreamHealthSignal[], level: StreamHealthSignal['level']) =>
  signals.filter((signal) => signal.level === level).length;

export const summarizeSignalDensity = (signals: readonly StreamHealthSignal[]): number => {
  const score = (bySignalLevel(signals, 'critical') * 3 + bySignalLevel(signals, 'warning')) / Math.max(signals.length, 1);
  return Number((1 - Math.min(1, score / 10)).toFixed(3));
};
