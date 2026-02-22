import { ok, fail, type Result } from '@shared/result';
import type { ContinuityStoreSnapshot } from './types';
import { withBrand } from '@shared/core';
import type { ContinuitySnapshot, ContinuitySignal } from '@domain/continuity-lens';

export interface SerializedContinuitySnapshot {
  readonly tenantId: string;
  readonly snapshot: ContinuitySnapshot;
  readonly signalCount: number;
}

export interface SerializedSignalBatch {
  readonly tenantId: string;
  readonly signals: readonly ContinuitySignal[];
}

export const encodeSnapshot = (payload: ContinuityStoreSnapshot): SerializedContinuitySnapshot => {
  return {
    tenantId: payload.tenantId,
    snapshot: {
      id: withBrand(`${payload.tenantId}:export:${Date.now()}`, 'ContinuitySnapshotId'),
      tenantId: payload.tenantId,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString(),
      riskScore: Math.max(0, payload.signalCount),
      trend: 'flat',
      signals: [],
      programs: [],
    },
    signalCount: payload.signalCount,
  };
};

export const decodeSnapshot = (payload: SerializedContinuitySnapshot): Result<ContinuitySnapshot, Error> => {
  if (!payload.snapshot.id) return fail(new Error('invalid snapshot'));
  if (payload.snapshot.signals.length === 0) {
    return fail(new Error('empty snapshot'));
  }
  return ok(payload.snapshot);
};

export const exportSignals = (signals: readonly ContinuitySignal[]): SerializedSignalBatch => ({
  tenantId: signals[0]?.tenantId ?? '',
  signals,
});
