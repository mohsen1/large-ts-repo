import type {
  ReadinessRunId,
  ReadinessSignal,
  ReadinessTarget,
  ReadinessSignalEnvelope,
  ReadinessPolicyViolation,
  ReadinessPolicyEnvelope,
  ReadinessSeverity,
} from './types';

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

export interface RiskWindowBucket {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly score: number;
  readonly signals: readonly ReadinessSignal[];
}

export interface TargetRiskProfile {
  readonly targetId: ReadinessTarget['id'];
  readonly targetName: string;
  readonly severityWeight: number;
  readonly rollingScore: number;
  readonly volatility: number;
}

export interface ReadinessRiskEnvelope {
  readonly runId: ReadinessRunId;
  readonly profile: readonly TargetRiskProfile[];
  readonly buckets: readonly RiskWindowBucket[];
  readonly totalScore: number;
}

interface SeverityWeightMap {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
}

const SEVERITY_WEIGHT: SeverityWeightMap = {
  low: 1,
  medium: 3,
  high: 8,
  critical: 16,
} as const;

const minutesToIso = (base: string, offsetMinutes: number): string =>
  new Date(Date.parse(base) + offsetMinutes * 60_000).toISOString();

function severityWeight(severity: ReadinessSeverity): number {
  return SEVERITY_WEIGHT[severity];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function bucketByWindow(signals: readonly ReadinessSignal[], bucketMinutes = 15): readonly RiskWindowBucket[] {
  if (signals.length === 0) {
    return [];
  }

  const sorted = [...signals].sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  const anchor = Date.parse(sorted[0].capturedAt);

  const bucketsByIndex = new Map<number, ReadinessSignal[]>();
  for (const signal of sorted) {
    const rawIndex = Math.floor((Date.parse(signal.capturedAt) - anchor) / (bucketMinutes * 60_000));
    const bucketIndex = Math.max(0, rawIndex);
    const existing = bucketsByIndex.get(bucketIndex);
    if (existing) {
      existing.push(signal);
    } else {
      bucketsByIndex.set(bucketIndex, [signal]);
    }
  }

  const buckets: RiskWindowBucket[] = [];
  for (const [bucketIndex, bucketSignals] of [...bucketsByIndex.entries()].sort(([left], [right]) => left - right)) {
    const bucketScore = bucketSignals.reduce((total, signal) => total + severityWeight(signal.severity), 0);
    const from = minutesToIso(sorted[0].capturedAt, bucketIndex * bucketMinutes);
    const to = minutesToIso(sorted[0].capturedAt, (bucketIndex + 1) * bucketMinutes);

    buckets.push({
      id: `${bucketSignals[0].runId}:w:${bucketIndex}` as ReadinessRunId & string,
      from,
      to,
      score: bucketScore,
      signals: bucketSignals,
    });
  }

  return buckets;
}

export function buildTargetProfile(
  signals: readonly ReadinessSignal[],
): {
  profiles: readonly TargetRiskProfile[];
  totalScore: number;
} {
  const grouped = new Map<ReadinessTarget['id'], ReadinessSignal[]>();
  for (const signal of signals) {
    const group = grouped.get(signal.targetId);
    if (group) {
      group.push(signal);
    } else {
      grouped.set(signal.targetId, [signal]);
    }
  }

  let grandTotal = 0;
  const profiles: TargetRiskProfile[] = Array.from(grouped.entries()).map(([targetId, targetSignals]) => {
    const severityTotal = targetSignals.reduce((sum, signal) => sum + severityWeight(signal.severity), 0);
    const volatility = targetSignals.length === 0 ? 0 : Math.round((new Set(targetSignals.map((signal) => signal.source)).size / targetSignals.length) * 100);
    const rolling = Math.min(200, severityTotal * (volatility === 0 ? 1 : volatility / 20));
    grandTotal += severityTotal;

    return {
      targetId,
      targetName: toStringValue(targetSignals[0]?.details?.['targetName']) || `Target ${targetId}`,
      severityWeight: severityTotal,
      rollingScore: rolling,
      volatility,
    };
  });

  return {
    profiles,
    totalScore: grandTotal,
  };
}

export function evaluateRiskEnvelope(signals: readonly ReadinessSignal[]): ReadinessRiskEnvelope {
  const runId = signals[0]?.runId ?? ('run:unbound' as ReadinessRunId);
  const buckets = bucketByWindow(signals);
  const { profiles, totalScore } = buildTargetProfile(signals);

  return {
    runId,
    profile: profiles,
    buckets,
    totalScore: clamp(totalScore, 0, 9999),
  };
}

export function detectPolicyViolations(
  policy: ReadinessPolicyEnvelope,
  signals: readonly ReadinessSignal[],
): readonly ReadinessPolicyViolation[] {
  const bySource = signals.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.source] = (acc[signal.source] ?? 0) + 1;
    return acc;
  }, {});

  const blocked = policy.blockedSignalSources;
  const violations: ReadinessPolicyViolation[] = [];

  for (const source of blocked) {
    const count = bySource[source] ?? 0;
    if (count > 0) {
      violations.push({
        reason: `blocked-source:${source}`,
        location: `source:${source}`,
        severity: 'medium',
        observedAt: new Date().toISOString(),
      });
    }
  }

  const bucketed = bucketByWindow(signals, 10);
  if (bucketed.some((bucket) => bucket.score > 24)) {
    violations.push({
      reason: 'density-threshold',
      location: policy.policyName,
      severity: 'high',
      observedAt: new Date().toISOString(),
    });
  }

  return violations;
}

export function envelopeToReadinessSignalEnvelope(
  signal: ReadinessSignal,
  index: number,
): ReadinessSignalEnvelope {
  return {
    signal,
    envelope: {
      batchIndex: index,
      sourceAgeMinutes: Math.max(0, (Date.now() - Date.parse(signal.capturedAt)) / (1000 * 60)),
      computedAt: new Date().toISOString(),
    },
    weight: severityWeight(signal.severity),
  };
}
