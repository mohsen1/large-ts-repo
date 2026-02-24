import { Result, fail, ok } from '@shared/result';
import { normalizeLimit } from '@shared/core';
import { TelemetryWindow, TelemetryRunId, OrchestratorHistory } from './models';
import { createHistory, appendWindow, appendAlert } from './history';
import { summarizeWindows } from './reporter';
import { TelemetryAlert } from './models';

export interface TelemetryStore {
  createRun(tenantId: string): Promise<Result<OrchestratorHistory>>;
  recordWindow(runId: string, window: Omit<TelemetryWindow, 'startAt' | 'endAt' | 'createdAt'> & {
    startAt: string;
    endAt: string;
  }): Promise<Result<OrchestratorHistory>>;
  recordAlert(runId: string, alert: Pick<TelemetryAlert, 'tenantId' | 'severity' | 'metric' | 'message'>): Promise<Result<OrchestratorHistory>>;
  getRun(runId: string): Promise<Result<OrchestratorHistory | undefined>>;
  listRuns(tenantId: string): Promise<Result<readonly OrchestratorHistory[]>>;
}

export class InMemoryFulfillmentTelemetryStore implements TelemetryStore {
  private readonly runs = new Map<string, OrchestratorHistory>();
  private readonly tenantRuns = new Map<string, string[]>();

  async createRun(tenantId: string): Promise<Result<OrchestratorHistory>> {
    const runId = `${tenantId}:${Date.now()}` as TelemetryRunId;
    const history = createHistory(runId, tenantId);
    const previous = this.tenantRuns.get(tenantId) ?? [];
    const list = [...previous, String(runId)];
    this.tenantRuns.set(tenantId, list.slice(-normalizeLimit(50)));
    this.runs.set(String(runId), history);
    return ok(history);
  }

  async recordWindow(
    runId: string,
    window: Omit<TelemetryWindow, 'startAt' | 'endAt' | 'createdAt'> & {
      startAt: string;
      endAt: string;
    },
  ): Promise<Result<OrchestratorHistory>> {
    const current = this.runs.get(runId);
    if (!current) {
      return fail(new Error('run not found'));
    }
    const updated = appendWindow(current, { runId: runId as TelemetryRunId, window });
    this.runs.set(runId, updated);
    return ok(updated);
  }

  async recordAlert(
    runId: string,
    alert: Pick<TelemetryAlert, 'tenantId' | 'severity' | 'metric' | 'message'>,
  ): Promise<Result<OrchestratorHistory>> {
    const current = this.runs.get(runId);
    if (!current) {
      return fail(new Error('run not found'));
    }
    const updated = appendAlert(current, {
      runId: runId as TelemetryRunId,
      tenantId: alert.tenantId,
      severity: alert.severity,
      metric: alert.metric,
      message: alert.message,
    });
    this.runs.set(runId, updated);
    return ok(updated);
  }

  async getRun(runId: string): Promise<Result<OrchestratorHistory | undefined>> {
    return ok(this.runs.get(runId));
  }

  async listRuns(tenantId: string): Promise<Result<readonly OrchestratorHistory[]>> {
    const ids = this.tenantRuns.get(tenantId) ?? [];
    const all = ids.map((id) => this.runs.get(id)).filter((run): run is OrchestratorHistory => Boolean(run));
    const sorted = all.sort((left, right) => Date.parse(right.completedAt ?? right.startedAt) - Date.parse(left.completedAt ?? left.startedAt));
    return ok(sorted);
  }
}

export const summarizeRecentRun = (tenantId: string, runs: readonly OrchestratorHistory[]): string[] =>
  runs.map((run) => {
    const summary = summarizeWindows(run);
    return `${run.runId}::${tenantId} windows=${summary.windowCount} avg=${summary.averageUtilization.toFixed(2)} alerts=${summary.alertCount}`;
  });
