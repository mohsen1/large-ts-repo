import { Brand } from '@shared/core';
import { NonEmptyArray } from '@shared/type-level';
import { SignalSample, SignalKind, AdaptivePolicy, AdaptiveDecision } from '@domain/adaptive-ops';

export type MetricsWindowId = Brand<string, 'MetricsWindowId'>;
export type HealthDimension = Brand<string, 'HealthDimension'>;

export interface MetricsWindow {
  id: MetricsWindowId;
  tenantId: string;
  windowStart: string;
  windowEnd: string;
  zone: string;
  policyCount: number;
  activePolicyCount: number;
  signalCount: number;
}

export interface SignalDigest {
  kind: SignalKind;
  min: number;
  max: number;
  avg: number;
  p90: number;
  p99: number;
  count: number;
}

export interface DecisionDensity {
  policyId: string;
  policyName: string;
  actionCount: number;
  avgConfidence: number;
  highRiskActionCount: number;
}

export interface HealthSignal {
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  activeSignals: readonly SignalKind[];
}

export interface RunHealthProfile {
  runId: string;
  tenantId: string;
  generatedAt: string;
  window: MetricsWindow;
  digest: readonly SignalDigest[];
  coverages: readonly DecisionDensity[];
  healthSignals: readonly HealthSignal[];
  score: number;
}

export interface RunForecastPoint {
  timestamp: string;
  projectedRisk: number;
  expectedRecoveryMinutes: number;
  dominantPolicyId: string | null;
  confidence: number;
}

export interface RunForecast {
  runId: string;
  tenantId: string;
  points: readonly RunForecastPoint[];
  recommendation: 'scale' | 'reroute' | 'observe' | 'noop';
}

export interface PolicyGraphNode {
  policyId: string;
  dependsOn: NonEmptyArray<string> | [];
}

export interface PolicyHealthState {
  tenantId: string;
  policies: readonly AdaptivePolicy[];
  activePolicyIds: readonly string[];
  decisionCount: number;
  conflictCount: number;
  decisionDensity: readonly DecisionDensity[];
  topSignals: readonly HealthSignal[];
}

export interface HealthSnapshot {
  tenantId: string;
  runId: string;
  score: number;
  riskTier: 'safe' | 'attention' | 'critical';
  details: string;
}

export const makeWindowId = (tenantId: string): MetricsWindowId => `${tenantId}:${Date.now()}` as MetricsWindowId;

export const toHealthSignal = (decision: AdaptiveDecision): HealthSignal => {
  const hasHighRisk = decision.risk === 'critical' || decision.confidence > 0.9;
  const activeSignals = new Set<SignalKind>(['manual-flag']);

  const inferredSignals = decision.selectedActions
    .filter((action): action is AdaptiveDecision['selectedActions'][number] => action.type !== 'notify')
    .map((action) => action.type === 'scale-up' ? 'availability' : action.type === 'reroute' ? 'latency' : 'error-rate');

  for (const kind of inferredSignals) {
    activeSignals.add(kind as SignalKind);
  }

  return {
    policyId: `${decision.policyId}`,
    severity: hasHighRisk ? 'critical' : decision.risk,
    score: decision.selectedActions.reduce((acc, action) => acc + action.intensity, 0),
    activeSignals: Array.from(activeSignals.values()),
  };
};

export const inferPolicyGraph = (policies: readonly AdaptivePolicy[]): readonly PolicyGraphNode[] => {
  return policies.map((policy) => ({
    policyId: `${policy.id}`,
    dependsOn:
      policy.dependencies.length === 0
        ? ([] as [])
        : (policy.dependencies.map((dependency) => `${dependency.serviceId}`) as NonEmptyArray<string>),
  }));
};

export const emptyHealthSignal = (tenantId: string, runId: string): HealthSnapshot => ({
  tenantId,
  runId,
  score: 0,
  riskTier: 'safe',
  details: `${tenantId}: no run artifacts`,
});

export const computeRiskTier = (score: number): HealthSnapshot['riskTier'] => {
  if (score >= 0.7) return 'critical';
  if (score >= 0.4) return 'attention';
  return 'safe';
};

export const summarizeSignals = (signals: readonly SignalSample[]): readonly SignalDigest[] => {
  const byKind = new Map<SignalKind, number[]>();

  for (const signal of signals) {
    const bucket = byKind.get(signal.kind) ?? [];
    bucket.push(signal.value);
    byKind.set(signal.kind, bucket);
  }

  return Array.from(byKind.entries()).map(([kind, values]) => {
    const sorted = [...values].sort((left, right) => left - right);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const avg = sorted.reduce((acc, next) => acc + next, 0) / sorted.length;
    const index90 = Math.floor((sorted.length - 1) * 0.9);
    const index99 = Math.floor((sorted.length - 1) * 0.99);
    return {
      kind,
      min,
      max,
      avg,
      p90: sorted[index90] ?? 0,
      p99: sorted[index99] ?? 0,
      count: sorted.length,
    };
  });
};
