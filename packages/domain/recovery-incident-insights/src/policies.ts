import type { IncidentSignal, PolicyRule, RecoveryPlay, SignalBundle } from './types';
import { generateForecast } from './forecast';

export interface PolicyContext {
  readonly bundle: SignalBundle;
  readonly candidateWindowMinutes: number;
}

export interface PolicyOutcome {
  readonly accepted: boolean;
  readonly policy: string;
  readonly reasons: readonly string[];
  readonly forecastPlayIds: readonly RecoveryPlay['playId'][];
}

const criticalSignalGuard: PolicyRule<PolicyContext, PolicyOutcome> = {
  code: 'policy:critical-signal-guard' as PolicyOutcome['policy'] & {
    readonly __brand: 'PolicyCode';
  },
  description: 'Require manual confirmation when critical security or infrastructure signals dominate',
  match: (context) => {
    const criticals = context.bundle.window.signals.filter(
      (signal) => signal.severity === 'critical',
    ).length;
    return criticals > 2;
  },
  apply: (context) => {
    const forecast = generateForecast(context.bundle, context.candidateWindowMinutes, 'policy');
    const reasons = ['manual-review-required', 'critical-signal-density'];
    return {
      accepted: false,
      policy: criticalSignalGuard.code,
      reasons,
      forecastPlayIds: forecast.recommendations.map((play) => play.playId),
    };
  },
};

const unstableStatePolicy: PolicyRule<PolicyContext, PolicyOutcome> = {
  code: 'policy:unstable-state-cap' as PolicyOutcome['policy'] & { readonly __brand: 'PolicyCode' },
  description: 'Block runbooks with too many high blast radius actions when stability is low',
  match: (context) => {
    const readiness = context.bundle.window.signals.filter((signal) =>
      signal.dimension === 'control-plane' && signal.severity === 'high',
    ).length;
    return readiness >= 2;
  },
  apply: (context) => {
    const forecast = generateForecast(context.bundle, context.candidateWindowMinutes, 'policy');
    const filtered = forecast.recommendations.filter((play) => play.blastRadius !== 'high');
    return {
      accepted: filtered.length > 0,
      policy: unstableStatePolicy.code,
      reasons: ['control-plane instability-capped'],
      forecastPlayIds: filtered.map((play) => play.playId),
    };
  },
};

const confidenceGate: PolicyRule<PolicyContext, PolicyOutcome> = {
  code: 'policy:low-confidence-gate' as PolicyOutcome['policy'] & { readonly __brand: 'PolicyCode' },
  description: 'Reject recommendations when model confidence falls below threshold',
  match: (context) => context.bundle.window.signals.some((signal) => signal.confidence < 0.4),
  apply: (context) => {
    return {
      accepted: false,
      policy: confidenceGate.code,
      reasons: ['insufficient-confidence'],
      forecastPlayIds: [],
    };
  },
};

const policySet: readonly PolicyRule<PolicyContext, PolicyOutcome>[] = [
  criticalSignalGuard,
  unstableStatePolicy,
  confidenceGate,
];

export const evaluatePolicies = (bundle: SignalBundle, candidateWindowMinutes: number): PolicyOutcome[] =>
  policySet.map((rule) => {
    if (!rule.match({ bundle, candidateWindowMinutes })) {
      return {
        accepted: true,
        policy: rule.code,
        reasons: [],
        forecastPlayIds: [],
      };
    }
    return rule.apply({ bundle, candidateWindowMinutes });
  });

export const buildPolicyDecision = (bundle: SignalBundle, candidateWindowMinutes: number): {
  readonly allowed: boolean;
  readonly outcomes: readonly PolicyOutcome[];
} => {
  const outcomes = evaluatePolicies(bundle, candidateWindowMinutes);
  const allowed = outcomes.every((outcome) => outcome.accepted);
  return { allowed, outcomes };
};
