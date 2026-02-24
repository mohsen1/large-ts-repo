import { TelemetryRunId, TelemetryWindow, TelemetryAlert, OrchestratorHistory } from './models';

export interface AppendWindowInput {
  runId: TelemetryRunId;
  window: Omit<TelemetryWindow, 'startAt' | 'endAt' | 'createdAt'> & {
    startAt: string;
    endAt: string;
  };
}

export interface AlertInput {
  runId: TelemetryRunId;
  tenantId: string;
  severity: TelemetryAlert['severity'];
  metric: TelemetryAlert['metric'];
  message: string;
}

export const createHistory = (runId: TelemetryRunId, tenantId: string): OrchestratorHistory => ({
  runId,
  tenantId,
  startedAt: new Date().toISOString(),
  status: 'queued',
  windows: [],
  alerts: [],
});

export const appendWindow = (history: OrchestratorHistory, input: AppendWindowInput): OrchestratorHistory => {
  const window: TelemetryWindow = {
    ...input.window,
    tenantId: history.tenantId,
    createdAt: new Date().toISOString(),
    startAt: input.window.startAt,
    endAt: input.window.endAt,
  };
  return {
    ...history,
    windows: [...history.windows, window],
  };
};

export const appendAlert = (history: OrchestratorHistory, input: AlertInput): OrchestratorHistory => {
  const alert: TelemetryAlert = {
    id: `${history.runId}:${input.metric}:${Date.now()}` as TelemetryAlert['id'],
    tenantId: input.tenantId,
    runId: input.runId,
    severity: input.severity,
    metric: input.metric,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  return {
    ...history,
    status: input.severity === 'critical' ? 'degraded' : history.status,
    alerts: [...history.alerts, alert],
  };
};
