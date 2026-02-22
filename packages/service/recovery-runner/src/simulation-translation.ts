import type {
  SimulationWorkspace,
  SimulationSummary,
  RecoveryRunId,
  RecoveryScenarioId,
  RecoverySimulationId,
} from '@domain/recovery-simulation-planning';
import { type SimulationRecordEnvelope, type SimulationRunRecord, type SimulationQueryFilter, type MetricSegment } from '@data/recovery-simulation-metrics';
import type { TelemetryEvent } from '@domain/recovery-simulation-planning';
import { withBrand } from '@shared/core';

export const createSimulationRecord = (
  summary: SimulationSummary,
  events: readonly TelemetryEvent[],
  workspaceId: string,
  tenant: string,
): SimulationRunRecord => {
  const duration = events.length * 60;
  const samples: readonly MetricSegment[] = events.map((event) => ({
    key: `${tenant}:${workspaceId}:${event.kind}`,
    value: event.kind === 'violation' ? 1 : 0,
    labels: { simulationId: event.simulationId, kind: event.kind },
  }));

  return {
    id: `${withBrand(workspaceId, 'RecoveryRunId')}:${workspaceId}` as SimulationRunRecord['id'],
    runId: withBrand(workspaceId, 'RecoveryRunId'),
    simulationId: `${events[0]?.simulationId ?? workspaceId}`,
    summary,
    samples,
    violations: [],
    startedAt: events[0]?.at ?? new Date(0).toISOString(),
    completedAt: new Date(Date.now() + duration * 1000).toISOString(),
  };
};

export const workspaceToRecord = (
  summary: SimulationSummary,
  workspace: SimulationWorkspace,
  tenant: string,
): SimulationRunRecord => ({
  id: `${workspace.runId}:${workspace.scenarioId}` as SimulationRunRecord['id'],
  runId: workspace.runId,
  simulationId: `${summary.id}`,
  summary,
  samples: [],
  violations: [],
  startedAt: workspace.createdAt,
  completedAt: new Date().toISOString(),
});

export const buildPayload = (record: SimulationRunRecord): SimulationRecordEnvelope => ({
  kind: 'finish',
  payload: {
    id: withBrand(`${record.runId}:${record.summary.scenarioId}`, 'RecoverySimulationId') as RecoverySimulationId,
    profile: {
      id: withBrand(`${record.runId}:${record.summary.scenarioId}`, 'RecoverySimulationId'),
      scenario: {
        id: withBrand(`${record.summary.scenarioId}`, 'RecoveryScenarioId'),
        tenant: withBrand(tenantAlias(`${record.summary.scenarioId}`), 'TenantId'),
        owner: tenantAlias(record.summary.id),
        title: `Recovered profile ${record.summary.scenarioId}`,
        window: {
          startAt: record.startedAt,
          endAt: record.completedAt,
          timezone: 'UTC',
        },
        steps: [],
        rules: [],
        createdAt: record.startedAt,
        updatedAt: record.completedAt,
      },
      runId: record.runId as RecoveryRunId,
      region: 'global',
      blastRadiusScore: 0.2,
      targetRtoMinutes: 10,
      targetRpoMinutes: 1,
      concurrencyCap: 1,
    },
    stepsExecuted: [],
    samples: [],
    violations: [],
    riskScore: Math.max(0, 100 - record.summary.score) / 10,
    readinessAtEnd: record.summary.readinessState,
    executedAt: record.completedAt,
    durationMs: 0,
  },
  receivedAt: record.completedAt,
});

export const summarizeFilter = (filter: SimulationQueryFilter): SimulationQueryFilter => ({
  tenant: filter.tenant,
  status: filter.status,
  from: filter.from,
  to: filter.to,
});

const tenantAlias = (identifier: string): string =>
  identifier.split(':')[0] ?? 'global';
