import type { IntelligenceSnapshot, SignalRecord, RunSnapshotAggregate, SnapshotId, AggregationInput } from './models';
import { withBrand } from '@shared/core';
import type { CohortSignalAggregate, RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';
import { aggregateByTenantAndRun, buildBatchAssessment, buildBatchFromSignals } from '@domain/recovery-operations-intelligence';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';

export type CohortDigest = string & { readonly __brand: 'CohortDigest' };
export type ProjectionStatus = 'missing' | 'ready' | 'stale';

export interface SignalProjection {
  readonly projectionId: CohortDigest;
  readonly tenant: string;
  readonly runId: string;
  readonly cohortCount: number;
  readonly riskBands: readonly ('green' | 'amber' | 'red')[];
  readonly totalSignals: number;
  readonly topSignals: readonly string[];
  readonly window: string;
}

export interface ProjectionSeries {
  readonly tenant: string;
  readonly runId: string;
  readonly snapshots: readonly SignalProjection[];
  readonly trend: number;
  readonly status: ProjectionStatus;
}

export interface SignalProjectionRepository {
  saveProjection(projection: SignalProjection): Promise<void>;
  listByTenant(tenant: string): Promise<readonly SignalProjection[]>;
  loadLatest(tenant: string, runId: string): Promise<SignalProjection | undefined>;
}

export interface MemoryProjectionStorage {
  readonly projections: readonly SignalProjection[];
}

interface WindowInput {
  readonly tenant: string;
  readonly runId: string;
  readonly signals: readonly SignalRecord[];
}

const scoreSignal = (signal: SignalRecord): number => signal.score * signal.signalId.length;

const topSource = (signals: readonly SignalRecord[]): readonly string[] =>
  signals
    .slice()
    .sort((left, right) => scoreSignal(right) - scoreSignal(left))
    .slice(0, 6)
    .map((signal) => `${signal.signal.id}`);

export const buildProjectionFromSignals = (input: WindowInput): SignalProjection => {
  const snapshotSignals = input.signals.filter((signal) => signal.tenant === input.tenant);
  const normalized = snapshotSignals.map((signal) => ({
    tenant: signal.tenant,
    runId: signal.runId,
    signal,
  }));

  const inferred = normalized.map((entry) => ({
    window: {
      tenant: entry.signal.tenant,
      from: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
      zone: 'UTC',
    },
    tags: [],
    source: 'queue' as RecoveryRiskSignal['source'],
    envelopeId: `${entry.signal.signalId}-projection`,
    runId: withBrand(input.runId, 'IntelligenceRunId'),
    signal: {
      id: `${entry.signal.signalId}`,
      source: 'projection',
      severity: 1 + (entry.runId.length % 10),
      confidence: Math.min(1, scoreSignal(entry.signal) / 1000),
      detectedAt: entry.signal.consumedAt,
      details: entry.signal.signal.details,
    },
  }));

  const cohorts: readonly CohortSignalAggregate[] = aggregateByTenantAndRun(inferred);
  const batch = buildBatchFromSignals(inferred);
  const topSignals = topSource(snapshotSignals);
  return {
    projectionId: withBrand(`${input.tenant}::${input.runId}::${snapshotSignals.length}`, 'CohortDigest'),
    tenant: input.tenant,
    runId: input.runId,
    cohortCount: cohorts.length,
    riskBands: [batch.overallRisk],
    totalSignals: snapshotSignals.length,
    topSignals,
    window: new Date().toISOString(),
  };
};

export const buildProjectionSeries = (projections: readonly SignalProjection[]): ProjectionSeries => {
  const sorted = projections.slice().sort((left, right) => right.window.localeCompare(left.window));
  const latest = sorted[0];
  const trend = sorted.length >= 2 ? sorted[0]!.cohortCount - sorted[sorted.length - 1]!.cohortCount : 0;

  return {
    tenant: latest?.tenant ?? 'unknown',
    runId: latest?.runId ?? 'unknown',
    snapshots: sorted,
    trend,
    status: sorted.length >= 2 ? 'ready' : 'missing',
  };
};

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryProjectionRepository implements SignalProjectionRepository {
  private readonly storage: SignalProjection[] = [];

  async saveProjection(projection: SignalProjection): Promise<void> {
    const next = this.storage.filter(
      (entry) => !(entry.tenant === projection.tenant && entry.runId === projection.runId),
    );
    this.storage.length = 0;
    this.storage.push(...next, clone(projection));
  }

  async listByTenant(tenant: string): Promise<readonly SignalProjection[]> {
    return this.storage.filter((entry) => entry.tenant === tenant).map(clone);
  }

  async loadLatest(tenant: string, runId: string): Promise<SignalProjection | undefined> {
    return this.storage
      .filter((entry) => entry.tenant === tenant && entry.runId === runId)
      .sort((left, right) => right.window.localeCompare(left.window))[0];
  }
}

export const validateProjection = (projection: SignalProjection): Result<SignalProjection, string> => {
  if (!projection.tenant) {
    return fail('EMPTY_TENANT');
  }
  if (projection.totalSignals < 0) {
    return fail('NEGATIVE_SIGNAL_COUNT');
  }
  return ok(projection);
};

export const aggregateToInput = (snapshotId: SnapshotId): AggregationInput => ({
  tenant: withBrand(`tenant-${snapshotId}`, 'TenantId'),
  runId: String(snapshotId),
  windowHours: 24,
  minConfidence: 0.5,
});

export const summarizeProjectionStatus = (input: ProjectionSeries): string =>
  `${input.tenant}|${input.runId}|${input.status}|n=${input.snapshots.length}|trend=${input.trend}`;
