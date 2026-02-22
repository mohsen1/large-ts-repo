import { withBrand } from '@shared/core';
import type {
  ConstraintViolation,
  RecoveryRunId,
  RecoverySimulationId,
  RecoveryScenarioId,
  SimulationResult,
} from '@domain/recovery-simulation-planning';
import type {
  SimulationQueryFilter,
  SimulationRecordEnvelope,
  SimulationRunRecord,
  SimulationRunRecord as RecordEntity,
} from './models';
import type { RecoverySimulationMetricsRepository } from './repository';

export interface SimulationPersistenceAdapter {
  encode(record: RecordEntity): string;
  decode(raw: string): RecordEntity;
}

export const JsonSimulationPersistence: SimulationPersistenceAdapter = {
  encode: (record: SimulationRunRecord): string => JSON.stringify(record),
  decode: (raw: string): SimulationRunRecord => JSON.parse(raw) as SimulationRunRecord,
};

const buildSimulationId = (record: SimulationRunRecord): RecoverySimulationId =>
  withBrand(`${record.runId}:${record.summary.id}`, 'RecoverySimulationId');

export const buildEnvelope = (record: SimulationRunRecord): SimulationRecordEnvelope => {
  const simulationId = buildSimulationId(record);
  const payload: SimulationResult = {
    id: simulationId,
    profile: {
      id: simulationId,
      scenario: {
        id: withBrand(`${record.summary.scenarioId}`, 'RecoveryScenarioId'),
        tenant: withBrand(`${record.summary.scenarioId}`.split(':')[0] ?? 'global', 'TenantId'),
        owner: 'system',
        title: `Recovered profile for ${record.summary.scenarioId}`,
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
      runId: withBrand(`${record.runId}`, 'RecoveryRunId'),
      region: 'global',
      blastRadiusScore: 0,
      targetRtoMinutes: 1,
      targetRpoMinutes: 1,
      concurrencyCap: 1,
    },
    stepsExecuted: [],
    samples: [],
    violations: record.violations,
    riskScore: Math.max(0, 100 - record.summary.score),
    readinessAtEnd: record.summary.readinessState,
    executedAt: record.completedAt,
    durationMs: 0,
  };

  return {
    kind: 'finish',
    payload,
    receivedAt: record.completedAt,
  };
};

export const serializeRecord = (record: SimulationRunRecord, adapter: SimulationPersistenceAdapter = JsonSimulationPersistence) =>
  adapter.encode(record);

export const deserializeRecord = (payload: string, adapter: SimulationPersistenceAdapter = JsonSimulationPersistence) =>
  adapter.decode(payload);

export const ingestEnvelope = async (
  repository: RecoverySimulationMetricsRepository,
  envelope: SimulationRecordEnvelope,
): Promise<void> => {
  const summary: SimulationRunRecord['summary'] = {
    id: withBrand(
      `${withBrand(envelope.payload.profile.runId, 'RecoveryRunId')}:${envelope.payload.profile.scenario.id}`,
      'RecoverySimulationId',
    ),
    scenarioId: withBrand(envelope.payload.profile.scenario.id, 'RecoveryScenarioId'),
    status:
      envelope.payload.readinessAtEnd === 'failed'
        ? 'failed'
        : envelope.payload.readinessAtEnd === 'idle'
          ? 'degraded'
          : 'ok',
    score: Math.max(0, 100 - Math.round((envelope.payload.riskScore ?? 0) * 10)),
    readinessState: envelope.payload.readinessAtEnd,
    failureCount: envelope.payload.violations.length,
    recommendedActions: envelope.payload.violations.map((item: ConstraintViolation) => item.ruleId),
  };

  const runId = withBrand(`${envelope.payload.profile.runId}`, 'RecoveryRunId') as RecoveryRunId;
  const simulationId = withBrand(`${runId}:${summary.scenarioId}`, 'RecoverySimulationId');
  const record: SimulationRunRecord = {
    id: `${runId}:${summary.id}` as SimulationRunRecord['id'],
    runId,
    simulationId,
    summary,
    samples: [],
    violations: [...envelope.payload.violations],
    startedAt: envelope.payload.executedAt,
    completedAt: envelope.payload.executedAt,
  };

  await repository.save(record);
};

export const queryRecordsForTenant = async (
  repository: RecoverySimulationMetricsRepository,
  filter: SimulationQueryFilter,
) => {
  return repository.query(filter, 200);
};
