import type { FusionBundle, FusionEvaluation } from './types';
import { buildReadinessProfile } from './readiness-metrics';
import { buildSignalTransitions } from './signal-catalog';

export interface SLOTarget {
  readonly maxAcceptableRisk: number;
  readonly minReadiness: number;
  readonly maxResourceUtilization: number;
}

export interface BundleSLOVerdict {
  readonly bundleId: string;
  readonly at: string;
  readonly passed: boolean;
  readonly score: number;
  readonly breaches: readonly string[];
  readonly suggestions: readonly string[];
}

const defaultSLO: SLOTarget = {
  maxAcceptableRisk: 0.6,
  minReadiness: 0.45,
  maxResourceUtilization: 0.85,
};

const scoreTransitionStability = (bundle: FusionBundle): number => {
  const transitions = buildSignalTransitions(bundle.signals);
  if (transitions.length === 0) return 1;
  const mean = transitions.reduce((sum, transition) => sum + transition.score, 0) / transitions.length;
  return Math.max(0, Math.min(1, mean));
};

const findBreaches = (profile: ReturnType<typeof buildReadinessProfile>): readonly string[] => {
  const breaches: string[] = [];
  if (profile.minReadiness < defaultSLO.minReadiness) {
    breaches.push(`minReadiness=${profile.minReadiness.toFixed(2)} < ${defaultSLO.minReadiness}`);
  }
  if (profile.maxReadiness > 1) {
    breaches.push(`maxReadiness=${profile.maxReadiness.toFixed(2)} exceeds bounds`);
  }
  if (!profile.isStable) {
    breaches.push('bundle-unstable');
  }
  return breaches;
};

const suggestionsFromEvaluations = (evaluations: readonly FusionEvaluation[]): readonly string[] => {
  const suggestions = new Set<string>();
  for (const evaluation of evaluations) {
    if (evaluation.score < 0.5) {
      suggestions.add(`investigate:${evaluation.bundleId}`);
    }
    if (evaluation.severity > 0.8) {
      suggestions.add(`reduce-risk:${evaluation.bundleId}`);
    }
  }
  return [...suggestions];
};

export const evaluateSLO = (bundle: FusionBundle, evaluations: readonly FusionEvaluation[]): BundleSLOVerdict => {
  const profile = buildReadinessProfile(bundle);
  const transitions = scoreTransitionStability(bundle);
  const breaches = [...findBreaches(profile)];
  if (transitions < 0.2) {
    breaches.push('low transition stability');
  }

  const utilizationScore = profile.minReadiness;
  const resourceScore = Math.max(0, 1 - profile.maxReadiness);
  const score = Math.max(0, Math.min(1, (profile.averageReadiness + utilizationScore + resourceScore + transitions) / 4));
  const passed = breaches.length === 0 && score >= defaultSLO.maxAcceptableRisk;

  return {
    bundleId: String(bundle.id),
    at: new Date().toISOString(),
    passed,
    score,
    breaches,
    suggestions: [...suggestionsFromEvaluations(evaluations), `transition-score=${transitions.toFixed(3)}`],
  };
};
