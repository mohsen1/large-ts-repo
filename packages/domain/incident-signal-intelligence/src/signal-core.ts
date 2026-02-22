import { withBrand } from '@shared/core';

export type SignalKind = 'operational' | 'financial' | 'security' | 'capacity' | 'availability';
export type SignalState = 'probing' | 'observed' | 'confirmed' | 'degraded' | 'mitigated' | 'resolved';
export type RiskBand = 'low' | 'moderate' | 'high' | 'critical';

export type SignalId = ReturnType<typeof withBrand<string, 'SignalId'>>;
export type TenantId = ReturnType<typeof withBrand<string, 'TenantId'>>;
export type ZoneId = ReturnType<typeof withBrand<string, 'ZoneId'>>;
export type SignalPlanId = ReturnType<typeof withBrand<string, 'SignalPlanId'>>;

export const signalKinds = ['operational', 'financial', 'security', 'capacity', 'availability'] as const;
export const signalStates = ['probing', 'observed', 'confirmed', 'degraded', 'mitigated', 'resolved'] as const;
export const riskBands = ['low', 'moderate', 'high', 'critical'] as const;

export const makeTenantId = (value: string): TenantId => withBrand(value, 'TenantId');
export const makeZoneId = (value: string): ZoneId => withBrand(value, 'ZoneId');
export const makeSignalId = (seed: string): SignalId => withBrand(`${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`, 'SignalId');
export const makeSignalPlanId = (seed: string): SignalPlanId => withBrand(`plan-${seed}:${Date.now()}`, 'SignalPlanId');

export const buildSignalId = makeSignalId;
export const makeSignalPlanCandidateId = (seed: string): SignalPlanId => makeSignalPlanId(seed);

export interface SignalVector {
  readonly magnitude: number;
  readonly variance: number;
  readonly entropy: number;
}

export interface SignalMeta {
  readonly source: string;
  readonly observedBy: string;
  readonly region: string;
  readonly tags: readonly string[];
}

export interface SignalEnvelope {
  readonly id: SignalId;
  readonly tenantId: TenantId;
  readonly zone: ZoneId;
  readonly kind: SignalKind;
  readonly state: SignalState;
  readonly vector: SignalVector;
  readonly risk: RiskBand;
  readonly recordedAt: string;
  readonly correlationKeys: readonly string[];
  readonly meta: SignalMeta;
}

export interface SignalEvidence {
  readonly key: string;
  readonly value: string;
  readonly weight: number;
  readonly capturedAt: string;
}

export interface SignalPulse {
  readonly envelope: SignalEnvelope;
  readonly evidence: readonly SignalEvidence[];
  readonly dependencies: readonly SignalId[];
}

export interface SignalScoreModel {
  readonly bias: number;
  readonly multipliers: Record<SignalKind, number>;
  readonly recencyWeight: number;
  readonly dampening: number;
}

export interface SignalWindow {
  readonly from: string;
  readonly to: string;
  readonly samples: readonly SignalVector[];
}

export interface SignalWindowStats {
  readonly count: number;
  readonly meanMagnitude: number;
  readonly meanVariance: number;
  readonly maxMagnitude: number;
  readonly minMagnitude: number;
  readonly volatility: number;
}

export interface SignalRiskProfile {
  readonly signalId: SignalId;
  readonly riskBand: RiskBand;
  readonly confidence: number;
  readonly impactScore: number;
  readonly mitigationLeadMinutes: number;
}

export interface SignalPlanCandidate {
  readonly id: SignalPlanId;
  readonly signalId: SignalId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly rationale: string;
  readonly actions: readonly {
    readonly type: 'pause' | 'shift' | 'scale' | 'notify' | 'drain';
    readonly priority: number;
    readonly target: string;
  }[];
  readonly expectedDowntimeMinutes: number;
  readonly approved: boolean;
}

export interface SignalWindowInput {
  readonly tenantId: TenantId;
  readonly signalKind: SignalKind;
  readonly from: string;
  readonly to: string;
  readonly limit?: number;
}

export interface SignalQueryFilter {
  readonly tenantId?: TenantId;
  readonly kinds?: readonly SignalKind[];
  readonly states?: readonly SignalState[];
  readonly riskBands?: readonly RiskBand[];
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
}

export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const normalizeSignalRisk = (risk: number): RiskBand => {
  if (risk >= 0.85) return 'critical';
  if (risk >= 0.6) return 'high';
  if (risk >= 0.3) return 'moderate';
  return 'low';
};

export const buildWindowFingerprint = (window: SignalWindow): string => `${window.samples.length}:${window.from}:${window.to}`;

export const normalizeSignalVector = (input: Partial<SignalVector>): SignalVector => ({
  magnitude: clamp(input.magnitude ?? 0, 0, 1),
  variance: clamp(input.variance ?? 0, 0, 1),
  entropy: clamp(input.entropy ?? 0, 0, 1),
});

export const estimateImpactScore = (vector: SignalVector, model: SignalScoreModel): number => {
  const base = vector.magnitude * model.multipliers.operational
    + vector.variance * model.multipliers.availability
    + vector.entropy * model.multipliers.security
    + model.bias;
  const recencyBoost = Math.max(0, model.recencyWeight * (1 - vector.entropy));
  return clamp((base + recencyBoost) * model.dampening, 0, 1);
};

export const summarizePulse = (pulse: SignalPulse, model: SignalScoreModel): SignalRiskProfile => {
  const score = estimateImpactScore(pulse.envelope.vector, model);
  const confidence = clamp(
    pulse.evidence.reduce((acc, entry) => acc + Math.max(0, entry.weight), 0) / Math.max(1, pulse.evidence.length),
    0,
    1,
  );
  return {
    signalId: pulse.envelope.id,
    riskBand: normalizeSignalRisk(score),
    confidence,
    impactScore: Number(score.toFixed(4)),
    mitigationLeadMinutes: Math.max(15, Math.round(180 * score)),
  };
};

export const applySignalFilter = (signal: SignalEnvelope, filter: SignalQueryFilter): boolean => {
  if (filter.tenantId && signal.tenantId !== filter.tenantId) return false;
  if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(signal.kind)) return false;
  if (filter.states && filter.states.length > 0 && !filter.states.includes(signal.state)) return false;
  if (filter.riskBands && filter.riskBands.length > 0 && !filter.riskBands.includes(signal.risk)) return false;
  if (filter.from && signal.recordedAt < filter.from) return false;
  if (filter.to && signal.recordedAt > filter.to) return false;
  if (filter.search) {
    const haystack = `${signal.id} ${signal.kind} ${signal.meta.source}`.toLowerCase();
    if (!haystack.includes(filter.search.toLowerCase())) return false;
  }
  return true;
};

export const buildQueryLimit = (limit?: number): number => {
  if (!Number.isFinite(limit ?? NaN)) return 50;
  if ((limit as number) < 1) return 1;
  if ((limit as number) > 5000) return 5000;
  return Math.floor(limit as number);
};
