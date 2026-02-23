import { RecoverySignal, RecoverySignalId, SeverityBand, SignalClass, WorkloadId, TenantId, createSignalId } from './models';
import { NodeId, normalizeLimit } from '@shared/core';

export interface SignalSeriesPoint {
  readonly at: string;
  readonly signalId: RecoverySignalId;
  readonly severity: RecoverySignal['severity'];
  readonly class: RecoverySignal['class'];
  readonly count: number;
}

export interface SignalCadenceProfile {
  readonly tenantId: TenantId;
  readonly totalSignals: number;
  readonly uniqueWorkloads: readonly WorkloadId[];
  readonly classBreakdown: Readonly<Record<SignalClass, number>>;
  readonly severityBreakdown: Readonly<Record<SeverityBand, number>>;
}

export interface SignalEnvelope {
  readonly byClass: ReadonlyArray<{ class: SignalClass; signals: readonly RecoverySignal[] }>;
  readonly bySeverity: ReadonlyArray<{ severity: SeverityBand; signals: readonly RecoverySignal[] }>;
}

export interface SignalTrend {
  readonly signalId: RecoverySignalId;
  readonly cadence: ReadonlyArray<SignalSeriesPoint>;
  readonly intensity: number;
}

interface SignalWindow {
  readonly from: Date;
  readonly to: Date;
}

const WINDOW_MS = 1000 * 60 * 60;

const normalizeClass = (value: RecoverySignal['class']): SignalClass => {
  if (value === 'availability' || value === 'integrity' || value === 'performance' || value === 'compliance') {
    return value;
  }
  return 'availability';
};

const normalizeSeverity = (value: RecoverySignal['severity']): SeverityBand => {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'low';
};

export const buildSignalCadenceProfile = (tenantId: TenantId, signals: readonly RecoverySignal[]): SignalCadenceProfile => {
  const byClass: Record<SignalClass, number> = {
    availability: 0,
    integrity: 0,
    performance: 0,
    compliance: 0,
  };
  const bySeverity: Record<SeverityBand, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  const workloadSet = new Set<WorkloadId>();

  for (const signal of signals) {
    const signalClass = normalizeClass(signal.class);
    const signalSeverity = normalizeSeverity(signal.severity);
    byClass[signalClass] = (byClass[signalClass] ?? 0) + 1;
    bySeverity[signalSeverity] = (bySeverity[signalSeverity] ?? 0) + 1;

    const impacted = signal.metadata?.['workloadId'];
    if (typeof impacted === 'string' && impacted.length > 0) {
      workloadSet.add(impacted as WorkloadId);
    }
  }

  return {
    tenantId,
    totalSignals: signals.length,
    uniqueWorkloads: [...workloadSet],
    classBreakdown: byClass,
    severityBreakdown: bySeverity,
  };
}

export const splitSignalsByClassAndSeverity = (signals: readonly RecoverySignal[]): SignalEnvelope => {
  const classBuckets = new Map<SignalClass, RecoverySignal[]>();
  const severityBuckets = new Map<SeverityBand, RecoverySignal[]>();

  for (const signal of signals) {
    const normalizedClass = normalizeClass(signal.class);
    const normalizedSeverity = normalizeSeverity(signal.severity);
    classBuckets.set(normalizedClass, [...(classBuckets.get(normalizedClass) ?? []), signal]);
    severityBuckets.set(normalizedSeverity, [...(severityBuckets.get(normalizedSeverity) ?? []), signal]);
  }

  const byClass = (['availability', 'integrity', 'performance', 'compliance'] as const).map((className) => ({
    class: className,
    signals: [...(classBuckets.get(className) ?? [])],
  }));
  const bySeverity = (['low', 'medium', 'high', 'critical'] as const).map((severity) => ({
    severity,
    signals: [...(severityBuckets.get(severity) ?? [])],
  }));

  return { byClass, bySeverity };
};

const buildWindowedPoints = (signals: readonly RecoverySignal[], window: SignalWindow): SignalSeriesPoint[] => {
  const points: SignalSeriesPoint[] = [];

  for (const signal of signals) {
    const createdAt = new Date(signal.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }
    if (createdAt.getTime() < window.from.getTime() || createdAt.getTime() > window.to.getTime()) {
      continue;
    }

    points.push({
      at: createdAt.toISOString(),
      signalId: signal.id,
      severity: signal.severity,
      class: signal.class,
      count: 1,
    });
  }

  return points.sort((left, right) => left.at.localeCompare(right.at));
};

export const buildSignalTrends = (signals: readonly RecoverySignal[], windowCount = 6): SignalTrend[] => {
  if (signals.length === 0) return [];

  const now = Date.now();
  const normalizedCount = normalizeLimit(windowCount);
  const windows: SignalWindow[] = [];

  for (let index = 0; index < normalizedCount; index += 1) {
    const end = now - index * WINDOW_MS;
    const start = end - WINDOW_MS;
    windows.push({ from: new Date(start), to: new Date(end) });
  }

  const grouped = new Map<string, SignalSeriesPoint[]>();

  for (const window of windows) {
    for (const point of buildWindowedPoints(signals, window)) {
      const current = grouped.get(point.signalId) ?? [];
      current.push(point);
      grouped.set(point.signalId, current);
    }
  }

  const output: SignalTrend[] = [];
  for (const [signalId, points] of grouped) {
    const weighted = points.reduce((sum, point) => {
      const base = point.severity === 'critical' ? 4 : point.severity === 'high' ? 3 : point.severity === 'medium' ? 2 : 1;
      return sum + base * point.count;
    }, 0);

    output.push({
      signalId: createSignalId(signalId),
      cadence: [...points],
      intensity: weighted / Math.max(1, windows.length),
    });
  }

  return output.sort((left, right) => right.intensity - left.intensity);
};

export const deriveHighRiskSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  return signals
    .filter((signal) => signal.severity === 'critical' || signal.severity === 'high')
    .sort((left, right) => (right.severity === left.severity ? right.createdAt.localeCompare(left.createdAt) : right.severity.localeCompare(left.severity)));
};

export const dedupeSignalsByFingerprint = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  const seen = new Map<string, RecoverySignal>();
  for (const signal of signals) {
    const key = `${signal.class}|${signal.title}|${signal.createdAt.split('T')[0]}`;
    if (!seen.has(key)) {
      seen.set(key, signal);
    }
  }
  return [...seen.values()];
};
