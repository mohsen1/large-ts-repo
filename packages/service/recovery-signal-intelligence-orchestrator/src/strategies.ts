import type {
  CampaignPlan,
  CampaignEnvelope,
  CampaignConstraint,
  SignalCampaignSignal,
  OrchestrationMode,
  SignalBundle,
} from '@domain/recovery-signal-orchestration-models';
import {
  buildCampaignSignal,
  createCampaignId,
  normalizeCampaignConstraints,
  createExecutionPlanId,
  type ExecutionPlanId,
} from '@domain/recovery-signal-orchestration-models';
import {
  chooseExecutionPolicy,
  policyForPlan,
} from '@domain/recovery-signal-orchestration-models';
import { buildTopology, dimensionCoverage } from '@domain/recovery-signal-orchestration-models';

export interface CampaignBlueprint {
  readonly plan: CampaignPlan;
  readonly runTemplate: {
    readonly id: string;
  };
}

const fallbackConstraint: CampaignConstraint = normalizeCampaignConstraints({
  minSignals: 1,
  maxSignals: 12,
});

const buildSignals = (bundle: SignalBundle): SignalCampaignSignal[] =>
  bundle.pulses.map((pulse) => buildCampaignSignal(pulse, bundle.generatedBy));

const buildMode = (signals: readonly SignalCampaignSignal[]): OrchestrationMode => chooseExecutionPolicy(signals);

export const buildCampaignBlueprint = (bundle: SignalBundle, owner: string): CampaignBlueprint => {
  const signals = buildSignals(bundle);
  const mode = buildMode(signals);
  const constraints = normalizeCampaignConstraints({
    minSignals: fallbackConstraint.minSignals,
    maxSignals: fallbackConstraint.maxSignals,
    maxConcurrentDimensionMix: mode === 'burst' ? 1 : 2,
    minDimensionCoverage: dimensionCoverage(bundle.pulses),
    minimumConfidence: mode === 'adaptive' ? 0.52 : 0.36,
  });

  const id = createCampaignId(bundle.tenantId, bundle.pulses[0]?.facilityId ?? 'facility-unknown');
  const topology = buildTopology(bundle.pulses);
  const timeline = policyForPlan({
    id,
    tenantId: bundle.tenantId,
    facilityId: bundle.pulses[0]?.facilityId ?? 'facility-unknown',
    mode,
    constraints,
    signals,
    timeline: [],
    score: 0,
    createdAt: new Date().toISOString(),
    owner,
  }).timelineBuilder(signals);
  const score = timeline.reduce((acc, entry) => acc + entry.confidence, 0) / Math.max(1, timeline.length);

  const plan: CampaignPlan = {
    id,
    tenantId: bundle.tenantId,
    facilityId: bundle.pulses[0]?.facilityId ?? 'facility-unknown',
    mode,
    constraints,
    signals,
    timeline,
    score,
    createdAt: new Date().toISOString(),
    owner,
  };

  const executionPlanId: ExecutionPlanId = createExecutionPlanId(plan.id, topology.crossLinks);

  const runTemplate = {
    id: `${executionPlanId}:${plan.mode}:template`,
  };

  return { plan, runTemplate };
};

export const buildEnvelope = (bundle: SignalBundle, owner: string): CampaignEnvelope => ({
  tenantId: bundle.tenantId,
  facilityId: bundle.pulses[0]?.facilityId ?? 'facility-unknown',
  bundleId: bundle.id,
  seed: `${owner}:${bundle.id}`,
  createdAt: new Date().toISOString(),
  pulses: bundle.pulses,
  metadata: {
    owner,
    totalPulses: bundle.pulses.length,
    envelopeGeneratedBy: bundle.generatedBy,
  },
});

export const isHighRiskMode = (plan: CampaignPlan): boolean => plan.mode === 'burst' || plan.mode === 'adaptive';
