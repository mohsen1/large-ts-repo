import { OrchestratorHistory, TelemetryWindow, ThroughputSample, TelemetryAlert } from './models';
import { toPercent, movingAverage } from '@shared/util';

export interface RunReport {
  tenantId: string;
  runId: string;
  windowCount: number;
  averageUtilization: number;
  maxTtrMs: number;
  avgTtrMs: number;
  alertCount: number;
}

export interface ThroughputSummary {
  tenantId: string;
  byWindow: readonly {
    windowId: string;
    utilization: number;
    backlog: number;
    ttr: number;
  }[];
}

export const summarizeWindows = (history: OrchestratorHistory): RunReport => {
  const windows = [...history.windows];
  const utilization = windows.map((window) => window.workerUtilization);
  const samples = windows.flatMap((window) => [window.workerUtilization]);
  const avgUtilization = samples.length ? Number((samples.reduce((acc, value) => acc + value, 0) / samples.length).toFixed(2)) : 0;

  const rates = windows.map((window) => Number(window.workerUtilization));
  const maxTtrMs = Math.max(...windows.map((window) => window.backlogUnits), 0);
  const avgTtrMs = rates.length === 0 ? 0 : Number((rates.reduce((acc, value) => acc + value, 0) / rates.length).toFixed(2));

  return {
    tenantId: history.tenantId,
    runId: String(history.runId),
    windowCount: windows.length,
    averageUtilization: avgUtilization,
    maxTtrMs,
    avgTtrMs,
    alertCount: history.alerts.length,
  };
};

export const buildThroughputSummary = (windows: readonly TelemetryWindow[]): ThroughputSummary => {
  return {
    tenantId: windows[0]?.tenantId ?? 'unknown',
    byWindow: windows.map((window) => ({
      windowId: `${window.windowId}`,
      utilization: Number(window.workerUtilization.toFixed(2)),
      backlog: Number(window.backlogUnits.toFixed(2)),
      ttr: Number(window.endAt ? (new Date(window.endAt).getTime() - new Date(window.startAt).getTime()) : 0),
    })),
  };
};

export const normalizeThroughputSamples = (
  tenantId: string,
  windows: readonly TelemetryWindow[],
): readonly ThroughputSample[] =>
  windows.map((window, index) => ({
    tenantId,
    orderId: `${tenantId}:${index}`,
    measuredAt: window.startAt,
    plannedWorkers: 12 + index,
    activeWorkers: Number(window.workerUtilization / 10),
    fulfillmentRate: toPercent(window.backlogUnits, Math.max(1, window.demandUnits)),
    ttrMs: Math.max(0, new Date(window.endAt).getTime() - new Date(window.startAt).getTime()),
    slaBreaches: window.backlogUnits > window.demandUnits ? 1 : 0,
  }));

export const forecastWindowHeat = (values: readonly number[]): readonly number[] => movingAverage(values, 3);
