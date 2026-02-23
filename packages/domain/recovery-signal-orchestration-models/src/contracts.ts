export const orchestrationModes = ['steady', 'burst', 'controlled', 'adaptive'] as const;
export const campaignStates = ['queued', 'active', 'throttled', 'completed', 'cancelled'] as const;

export type OrchestrationMode = (typeof orchestrationModes)[number];
export type CampaignState = (typeof campaignStates)[number];

export type CampaignId = string;
export type CampaignRunId = string;
export type ExecutionPlanId = string;

export type SignalDimension = 'capacity' | 'latency' | 'reachability' | 'integrity' | 'availability' | 'cost' | 'compliance';

export interface SignalPulse {
  readonly id: string;
  readonly category: 'incident' | 'readiness' | 'drill' | 'policy' | 'fleet';
  readonly tenantId: string;
  readonly facilityId: string;
  readonly dimension: SignalDimension;
  readonly value: number;
  readonly baseline: number;
  readonly weight: number;
  readonly timestamp: string;
  readonly observedAt: string;
  readonly source: 'agent' | 'telemetry' | 'manual' | 'simulator';
  readonly unit: string;
  readonly tags: string[];
}

export interface SignalBundle {
  readonly id: string;
  readonly tenantId: string;
  readonly pulses: readonly SignalPulse[];
  readonly envelopes: readonly unknown[];
  readonly generatedBy: string;
  readonly generatedAt: string;
}

export interface CampaignPlan {
  readonly id: CampaignId;
  readonly tenantId: string;
  readonly facilityId: string;
  readonly mode: OrchestrationMode;
  readonly constraints: CampaignConstraint;
  readonly signals: readonly SignalCampaignSignal[];
  readonly timeline: readonly CampaignTimelineStep[];
  readonly createdAt: string;
  readonly owner: string;
  readonly score: number;
}

export interface SignalCampaignSignal {
  readonly signalId: string;
  readonly facilityId: string;
  readonly facilityWeight: number;
  readonly burst: number;
  readonly impactProjection: number;
  readonly dimension: SignalDimension;
}

export interface CampaignConstraint {
  readonly minSignals: number;
  readonly maxSignals: number;
  readonly maxConcurrentDimensionMix: number;
  readonly minDimensionCoverage: number;
  readonly minimumConfidence: number;
}

export interface CampaignTimelineStep {
  readonly sequence: number;
  readonly name: string;
  readonly etaMinutes: number;
  readonly requiredSignals: number;
  readonly confidence: number;
  readonly dimension: SignalDimension;
}

export interface CampaignRun {
  readonly id: CampaignRunId;
  readonly planId: CampaignId;
  readonly state: CampaignState;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly stepCursor: number;
  readonly completedSteps: readonly number[];
  readonly score: number;
  readonly risk: number;
}

export interface CampaignEnvelope {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly bundleId: string;
  readonly seed: string;
  readonly createdAt: string;
  readonly pulses: readonly SignalPulse[];
  readonly metadata: Record<string, unknown>;
}

export interface DispatchEnvelope {
  readonly runId: CampaignRunId;
  readonly planId: CampaignId;
  readonly timestamp: string;
  readonly action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel';
  readonly reason: string;
}

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

export const createCampaignId = (tenantId: string, facilityId: string): CampaignId =>
  `${tenantId}:${facilityId}:campaign` as CampaignId;

export const createRunId = (planId: string): CampaignRunId => `${planId}:run` as CampaignRunId;

export const createExecutionPlanId = (planId: string, sequence: number): ExecutionPlanId =>
  `${planId}:exec-${sequence}` as ExecutionPlanId;

export const normalizeCampaignConstraints = (input: Partial<CampaignConstraint>): CampaignConstraint => {
  const minSignals = Math.max(1, input.minSignals ?? 1);
  const maxSignals = Math.max(minSignals, input.maxSignals ?? 12);
  const maxConcurrentDimensionMix = Math.max(1, input.maxConcurrentDimensionMix ?? 2);
  const minDimensionCoverage = clamp01(input.minDimensionCoverage ?? 0.3);
  const minimumConfidence = clamp01(input.minimumConfidence ?? 0.45);

  return {
    minSignals,
    maxSignals,
    maxConcurrentDimensionMix,
    minDimensionCoverage,
    minimumConfidence,
  };
};

export const deriveSignalWeight = (pulse: SignalPulse): number =>
  clamp01((Math.abs(pulse.value - pulse.baseline) / Math.max(1, Math.abs(pulse.baseline))) * pulse.weight);

export const planScore = (plan: CampaignPlan): number =>
  plan.signals.reduce((acc, signal) => acc + signal.impactProjection * signal.facilityWeight, 0) / Math.max(1, plan.signals.length);

export const buildTimeline = (signals: readonly SignalPulse[], mode: OrchestrationMode): readonly CampaignTimelineStep[] => {
  const multiplier = mode === 'burst' ? 1.6 : mode === 'adaptive' ? 1.2 : 0.8;
  return signals.map((signal, index) => ({
    sequence: index + 1,
    name: `step-${signal.dimension}-${signal.id}`,
    etaMinutes: Math.max(
      1,
      Math.round(Math.abs(signal.value - signal.baseline) * multiplier) + 1,
    ),
    requiredSignals: Math.max(1, signal.id.length % 4),
    confidence: Number(deriveSignalWeight(signal).toFixed(4)),
    dimension: signal.dimension,
  }));
};

export const buildCampaignSignal = (pulse: SignalPulse, owner: string): SignalCampaignSignal => ({
  signalId: pulse.id,
  facilityId: pulse.facilityId,
  facilityWeight: deriveSignalWeight(pulse),
  burst: Math.max(0, pulse.value - pulse.baseline),
  impactProjection: Math.max(0, pulse.value * 0.17),
  dimension: pulse.dimension,
});

export const validateCampaignPlan = (plan: CampaignPlan): string[] => {
  const errors: string[] = [];

  if (plan.signals.length < plan.constraints.minSignals) {
    errors.push('too few signals');
  }

  if (plan.signals.length > plan.constraints.maxSignals) {
    errors.push('too many signals');
  }

  if (plan.timeline.length !== plan.signals.length) {
    errors.push('timeline out of sync with signals');
  }

  if (plan.score < plan.constraints.minimumConfidence) {
    errors.push('plan score below minimum confidence');
  }

  return errors;
};
