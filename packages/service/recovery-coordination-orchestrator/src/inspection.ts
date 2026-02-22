import type { RecoveryCoordinationQuery, CoordinationRecord } from '@data/recovery-coordination-store';
import { deriveSignals, healthFromRecords, trendFromQuery } from '@data/recovery-coordination-store';
import type { RecoveryRunId } from '@domain/recovery-orchestration';

export interface CoordinationHealthDigest {
  readonly runId: RecoveryRunId;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly throughput: number;
  readonly selectedRate: number;
  readonly riskSignals: readonly string[];
}

export interface QuerySnapshot {
  readonly runCount: number;
  readonly runIds: readonly RecoveryRunId[];
  readonly hasRecords: boolean;
}

export const buildHealthDigest = (
  records: readonly CoordinationRecord[],
  query: RecoveryCoordinationQuery,
): CoordinationHealthDigest => {
  const trend = trendFromQuery(query, records);
  const signals = records.flatMap((record) => deriveSignals(record));
  const riskSignals = signals
    .filter((signal) => signal.kind === 'risk')
    .map((signal) => `${signal.kind}:${signal.value.toFixed(3)}:${signal.note}`);

  const throughput = records.length / Math.max(1, Number(query.take) || 1);
  const selectedRate = records.length
    ? records.filter((record) => record.selection.decision === 'approved').length / records.length
    : 0;

  return {
    runId: trend.runId,
    windowStart: trend.windowStart,
    windowEnd: trend.windowEnd,
    throughput,
    selectedRate,
    riskSignals,
  };
};

export const summarizeRecords = (records: readonly CoordinationRecord[]): QuerySnapshot => {
  const ids = new Set(records.map((record) => record.runId));
  return {
    runCount: records.length,
    runIds: [...ids],
    hasRecords: records.length > 0,
  };
};
