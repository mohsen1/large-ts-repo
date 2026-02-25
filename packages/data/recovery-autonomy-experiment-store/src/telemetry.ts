import type { StoreTelemetry } from './types';

export interface TelemetryReport {
  readonly status: StoreTelemetry['statusCounts'];
  readonly total: number;
  readonly activeRunRatio: string;
  readonly updatedAt: string;
}

export const toReport = (telemetry: StoreTelemetry): TelemetryReport => {
  const ratio = telemetry.recordCount
    ? ((telemetry.statusCounts.active / telemetry.recordCount) * 100).toFixed(1)
    : '0.0';

  return {
    status: telemetry.statusCounts,
    total: telemetry.recordCount,
    activeRunRatio: `${ratio}%`,
    updatedAt: telemetry.lastMutationAt,
  };
};

export const mergeReports = (left: StoreTelemetry, right: StoreTelemetry): StoreTelemetry => {
  const merged: Record<string, number> = { ...left.statusCounts };
  for (const [status, count] of Object.entries(right.statusCounts)) {
    merged[status] = (merged[status] ?? 0) + count;
  }

  return {
    recordCount: left.recordCount + right.recordCount,
    statusCounts: merged as StoreTelemetry['statusCounts'],
    lastMutationAt: left.lastMutationAt > right.lastMutationAt ? left.lastMutationAt : right.lastMutationAt,
  };
};

export const renderReport = (report: TelemetryReport): string => {
  const entries = Object.entries(report.status).map(([status, count]) => `${status}=${count}`).join(' · ');
  return [`records:${report.total}`, `active=${report.activeRunRatio}`, `updated=${report.updatedAt}`, entries].join(' | ');
};
