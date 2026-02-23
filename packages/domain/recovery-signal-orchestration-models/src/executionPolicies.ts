import type { SignalCampaignSignal, CampaignTimelineStep, CampaignPlan, OrchestrationMode } from './contracts';

export interface PolicyConstraint {
  readonly name: string;
  readonly minRequiredSignals: number;
  readonly minDimensionCoverage: number;
  readonly maxBurstsPerFacility: number;
}

export interface ExecutionPolicy {
  readonly mode: OrchestrationMode;
  readonly constraint: PolicyConstraint;
  readonly timelineBuilder: (signals: readonly SignalCampaignSignal[]) => readonly CampaignTimelineStep[];
  readonly priority: number;
}

const dimensionCoverage = (signals: readonly SignalCampaignSignal[]): number => {
  const distinct = new Set(signals.map((signal) => signal.dimension));
  return distinct.size / 7;
};

const defaultTimeline = (signals: readonly SignalCampaignSignal[]) =>
  signals.map((signal, index) => ({
    sequence: index + 1,
    name: `default-${signal.signalId}-${index}`,
    etaMinutes: Math.max(1, signal.facilityWeight * 100 + index),
    requiredSignals: 1,
    confidence: signal.impactProjection,
    dimension: signal.dimension,
  }));

const burstAwareTimeline = (signals: readonly SignalCampaignSignal[]) =>
  signals.map((signal, index) => ({
    sequence: index + 1,
    name: `burst-${signal.signalId}-${index}`,
    etaMinutes: Math.max(1, signal.burst),
    requiredSignals: Math.min(3, Math.max(1, signal.signalId.length % 4)),
    confidence: Math.min(1, signal.facilityWeight + 0.15),
    dimension: signal.dimension,
  }));

const adaptiveTimeline = (signals: readonly SignalCampaignSignal[]) =>
  signals.map((signal, index) => ({
    sequence: index + 1,
    name: `adaptive-${signal.signalId}-${index}`,
    etaMinutes: Math.max(1, 90 - signal.facilityWeight * 20 + index * 2),
    requiredSignals: 1,
    confidence: 0.55 + (index % 3) * 0.15,
    dimension: signal.dimension,
  }));

const controlledTimeline = (signals: readonly SignalCampaignSignal[]) =>
  signals.map((signal, index) => ({
    sequence: index + 1,
    name: `controlled-${signal.signalId}-${index}`,
    etaMinutes: 120,
    requiredSignals: Math.min(2, index + 1),
    confidence: 0.35,
    dimension: signal.dimension,
  }));

export const policyCatalog: Record<OrchestrationMode, ExecutionPolicy> = {
  burst: {
    mode: 'burst',
    constraint: {
      name: 'burst-throttle',
      minRequiredSignals: 2,
      minDimensionCoverage: 0.28,
      maxBurstsPerFacility: 2,
    },
    timelineBuilder: burstAwareTimeline,
    priority: 4,
  },
  adaptive: {
    mode: 'adaptive',
    constraint: {
      name: 'adaptive-variance',
      minRequiredSignals: 3,
      minDimensionCoverage: 0.35,
      maxBurstsPerFacility: 1,
    },
    timelineBuilder: adaptiveTimeline,
    priority: 3,
  },
  controlled: {
    mode: 'controlled',
    constraint: {
      name: 'control-first',
      minRequiredSignals: 1,
      minDimensionCoverage: 0.2,
      maxBurstsPerFacility: 3,
    },
    timelineBuilder: controlledTimeline,
    priority: 2,
  },
  steady: {
    mode: 'steady',
    constraint: {
      name: 'steady-state',
      minRequiredSignals: 1,
      minDimensionCoverage: 0.15,
      maxBurstsPerFacility: 5,
    },
    timelineBuilder: defaultTimeline,
    priority: 1,
  },
};

export const chooseExecutionPolicy = (
  signals: readonly SignalCampaignSignal[],
): OrchestrationMode => {
  const burstSignals = signals.filter((signal) => signal.burst > 150);
  const coverage = dimensionCoverage(signals);

  if (burstSignals.length >= 3 && coverage >= 0.6) {
    return 'burst';
  }
  if (burstSignals.length >= 1 && signals.length >= 4) {
    return 'adaptive';
  }
  if (signals.length >= 2 && coverage < 0.3) {
    return 'controlled';
  }
  return 'steady';
};

export const policyForPlan = (
  plan: CampaignPlan,
): ExecutionPolicy => policyCatalog[plan.mode];
