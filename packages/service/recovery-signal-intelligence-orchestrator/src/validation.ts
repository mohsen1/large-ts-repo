import type {
  CampaignEnvelope,
  CampaignPlan,
  CampaignConstraint,
  CampaignRun,
} from '@domain/recovery-signal-orchestration-models';
import { validateCampaignPlan } from '@domain/recovery-signal-orchestration-models';
import type { SignalBundle } from '@domain/recovery-signal-orchestration-models';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

export interface ValidationProfile {
  readonly isValid: boolean;
  readonly messages: readonly string[];
}

const hasSignals = (bundle: SignalBundle): boolean => bundle.pulses.length > 0;

const hasTenancy = (bundle: SignalBundle): boolean => bundle.tenantId.trim().length > 0;

const isFresh = (bundle: SignalBundle): boolean => {
  const parsed = Date.parse(bundle.generatedAt);
  return Number.isFinite(parsed);
}

export const validateSignalBundle = (bundle: SignalBundle): ValidationProfile => {
  const messages: string[] = [];
  if (!hasSignals(bundle)) {
    messages.push('bundle missing pulses');
  }
  if (!hasTenancy(bundle)) {
    messages.push('bundle missing tenant');
  }
  if (!isFresh(bundle)) {
    messages.push('bundle generatedAt is invalid');
  }

  return {
    isValid: messages.length === 0,
    messages,
  };
};

export const validatePlanEnvelope = (
  plan: CampaignPlan,
  run: CampaignRun,
): ValidationProfile => {
  const warnings = [...validateCampaignPlan(plan)];
  const runStateOk = ['queued', 'active', 'throttled', 'completed', 'cancelled'].includes(run.state);
  if (!runStateOk) {
    warnings.push(`unknown run state ${run.state}`);
  }
  if (run.score < 0 || run.score > 1) {
    warnings.push('run score invalid');
  }
  return {
    isValid: warnings.length === 0,
    messages: warnings,
  };
};

export const validateEnvelope = (envelope: CampaignEnvelope): ValidationProfile => {
  const failures: string[] = [];
  if (!envelope.bundleId) {
    failures.push('bundle id required');
  }
  if (!envelope.facilityId) {
    failures.push('facility required');
  }
  if (!envelope.tenantId) {
    failures.push('tenant required');
  }
  return {
    isValid: failures.length === 0,
    messages: failures,
  };
};

export const validateConstraint = (constraints: CampaignConstraint): Result<CampaignConstraint, Error> => {
  if (constraints.minSignals <= 0) {
    return fail(new Error('minSignals must be positive'));
  }
  if (constraints.maxSignals < constraints.minSignals) {
    return fail(new Error('maxSignals must be >= minSignals'));
  }
  if (constraints.maxConcurrentDimensionMix <= 0) {
    return fail(new Error('maxConcurrentDimensionMix must be positive'));
  }
  if (constraints.minDimensionCoverage < 0 || constraints.minDimensionCoverage > 1) {
    return fail(new Error('minDimensionCoverage invalid'));
  }
  if (constraints.minimumConfidence < 0 || constraints.minimumConfidence > 1) {
    return fail(new Error('minimumConfidence invalid'));
  }
  return ok(constraints);
};
