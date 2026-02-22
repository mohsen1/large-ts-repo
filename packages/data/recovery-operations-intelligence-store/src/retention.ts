import type { IntelligenceSnapshot, SignalRecord, RunSnapshotAggregate } from './models';
import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

export type RetentionMetric = Brand<string, 'RetentionMetric'>;

export interface RetentionPolicyInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly keepHours: number;
  readonly maxEntries: number;
  readonly allowNoisySignalTypes: readonly string[];
}

export interface RetentionOutcome {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly droppedSignals: number;
  readonly keptSnapshots: number;
  readonly keptBatches: number;
  readonly droppedBatches: number;
  readonly policy: RetentionMetric;
}

export interface RetentionSnapshot {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly timestamp: string;
  readonly signalCount: number;
  readonly aggregateCount: number;
}

export interface RetentionBucket {
  readonly snapshotId: string;
  readonly aggregate: RunSnapshotAggregate;
  readonly recordedAt: string;
  readonly ageHours: number;
}

const ageHours = (value: string, now = Date.now()): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }
  return (now - parsed) / (60 * 60 * 1000);
};

const signalIsAllowed = (
  record: SignalRecord,
  allowlist: readonly string[],
): boolean => {
  const signal = record.signal as { readonly source?: string; readonly details?: { readonly type?: string } };
  const type = (signal.source ?? signal.details?.type ?? '').toLowerCase();
  return allowlist.includes(type) || type === 'telemetry' || type === 'queue';
};

export interface RetentionPolicyConfig {
  readonly keepHours: number;
  readonly maxEntries: number;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly allowedSignalTypes: readonly string[];
}

export const makeRetentionPolicy = (input: RetentionPolicyInput): RetentionPolicyConfig => ({
  keepHours: input.keepHours,
  maxEntries: input.maxEntries,
  tenant: input.tenant,
  allowedSignalTypes: input.allowNoisySignalTypes,
});

export const applySignalRetention = (
  tenant: Brand<string, 'TenantId'>,
  signals: readonly SignalRecord[],
  policy: RetentionPolicyInput,
): readonly SignalRecord[] => {
  const now = Date.now();
  const allowed = new Set(policy.allowNoisySignalTypes.map((value) => value.toLowerCase()));

  const byRun = new Map<string, SignalRecord[]>();
  for (const signal of signals) {
    if (!signalIsAllowed(signal, Array.from(allowed))) {
      continue;
    }
    const runSignals = byRun.get(signal.runId) ?? [];
    runSignals.push(signal);
    byRun.set(signal.runId, runSignals);
  }

  const selected: SignalRecord[] = [];
  for (const [, grouped] of byRun) {
    const filtered = grouped
      .filter((signal) => ageHours(signal.consumedAt, now) <= policy.keepHours)
      .sort((left, right) => right.consumedAt.localeCompare(left.consumedAt))
      .slice(0, Math.max(0, policy.maxEntries));
    selected.push(...filtered);
  }

  return selected;
};

export const summarizeRetentionBuckets = (
  aggregates: readonly RunSnapshotAggregate[],
  now = new Date(),
): readonly RetentionBucket[] => {
  const result: RetentionBucket[] = [];
  for (const aggregate of aggregates) {
    const age = ageHours(now.toISOString(), Date.now());
    result.push({
      snapshotId: `${aggregate.tenant}-${aggregate.runId}-${aggregate.snapshotCount}`,
      aggregate,
      recordedAt: now.toISOString(),
      ageHours: age,
    });
  }
  return result.toSorted((left, right) => right.ageHours - left.ageHours);
};

export const estimateRetentionImpact = (
  policy: RetentionPolicyInput,
  snapshots: readonly IntelligenceSnapshot[],
  signals: readonly SignalRecord[],
  aggregates: readonly RunSnapshotAggregate[],
): RetentionOutcome => {
  const retainedSignals = applySignalRetention(policy.tenant, signals, policy);
  const keptSnapshots = snapshots.filter((snapshot) => ageHours(snapshot.recordedAt) <= policy.keepHours).length;
  const droppedSignals = signals.length - retainedSignals.length;
  const keptBatches = aggregates.length;
  const droppedBatches = 0;

  return {
    tenant: policy.tenant,
    droppedSignals,
    keptSnapshots,
    keptBatches,
    droppedBatches,
    policy: withBrand(`${policy.keepHours}-${policy.maxEntries}`, 'RetentionMetric'),
  };
};

export const validateRetentionInput = (input: RetentionPolicyInput): Result<RetentionPolicyInput, string> => {
  if (input.keepHours <= 0) return fail('RETENTION_KEEP_HOURS_REQUIRED');
  if (input.maxEntries <= 0) return fail('RETENTION_MAX_ENTRIES_REQUIRED');
  if (!input.tenant) return fail('RETENTION_TENANT_REQUIRED');
  return ok(input);
};

export interface RetentionPolicyFactory {
  readonly create: (tenant: Brand<string, 'TenantId'>) => RetentionPolicyInput;
  readonly evaluateSignals: (signals: readonly SignalRecord[]) => number;
}

export class DefaultRetentionPolicyFactory implements RetentionPolicyFactory {
  constructor(private readonly defaults: RetentionPolicyInput) {}

  create(tenant: Brand<string, 'TenantId'>): RetentionPolicyInput {
    return {
      tenant,
      keepHours: this.defaults.keepHours,
      maxEntries: this.defaults.maxEntries,
      allowNoisySignalTypes: [...this.defaults.allowNoisySignalTypes],
    };
  }

  evaluateSignals(signals: readonly SignalRecord[]): number {
    return signals.reduce((acc, signal) => acc + signal.score, 0);
  }
}

export const buildRetentionSnapshot = (
  tenant: Brand<string, 'TenantId'>,
  signals: readonly SignalRecord[],
  aggregates: readonly RunSnapshotAggregate[],
): RetentionSnapshot => ({
  tenant,
  timestamp: new Date().toISOString(),
  signalCount: signals.length,
  aggregateCount: aggregates.length,
});
