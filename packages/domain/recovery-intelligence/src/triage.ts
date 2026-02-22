import type {
  RecoveryActionCandidate,
  RecoveryForecast,
  RecoveryRecommendation,
  RecoverySignalBundle,
  RecoverySignal,
} from './types';
import { parseRecommendation } from './schemas';
import { clamp, roundTo } from './utils';

export interface TriageInput {
  readonly bundle: RecoverySignalBundle;
  readonly forecast: RecoveryForecast;
  readonly availableActions: readonly RecoveryActionCandidate[];
  readonly maxActions?: number;
}

export interface TriageDecision {
  readonly status: 'proceed' | 'pause' | 'abort';
  readonly urgencyScore: number;
  readonly selectedActions: readonly RecoveryActionCandidate[];
  readonly reason: string;
}

const urgencyFromForecast = (forecast: RecoveryForecast): number => {
  const densityWeight = clamp(forecast.signalDensity, 0, 1);
  const confidence = clamp(forecast.confidence, 0, 1);
  const minutesWeight = clamp(forecast.meanRecoveryMinutes / 180, 0, 1);
  return roundTo(densityWeight * 0.5 + (1 - confidence) * 0.2 + minutesWeight * 0.3, 4);
};

export const rankActions = (actions: readonly RecoveryActionCandidate[]): readonly RecoveryActionCandidate[] =>
  [...actions].sort((first, second) => {
    const firstPenalty = (first.prerequisites.length + first.estimatedMinutes + first.rollbackMinutes);
    const secondPenalty = (second.prerequisites.length + second.estimatedMinutes + second.rollbackMinutes);
    return firstPenalty - secondPenalty;
  });

export const buildTriage = ({
  bundle,
  forecast,
  availableActions,
  maxActions = 4,
}: TriageInput): TriageDecision => {
  const urgencyScore = urgencyFromForecast(forecast);
  const signalRisk = bundle.signals.reduce((count, signal) => count + riskWeight(signal), 0) / Math.max(1, bundle.signals.length);
  const riskAdjusted = clamp(urgencyScore + signalRisk * 0.2, 0, 1);
  const ordered = rankActions(availableActions);
  const topActions = ordered.slice(0, maxActions);

  if (riskAdjusted > 0.8) {
    return {
      status: 'abort',
      urgencyScore: riskAdjusted,
      selectedActions: topActions,
      reason: `Critical risk profile with weighted score ${riskAdjusted}. Human review required.`,
    };
  }

  if (riskAdjusted > 0.55) {
    return {
      status: 'pause',
      urgencyScore: riskAdjusted,
      selectedActions: topActions,
      reason: `Elevated risk; run with approvals and throttling.`,
    };
  }

  return {
    status: 'proceed',
    urgencyScore: riskAdjusted,
    selectedActions: topActions,
    reason: 'Risk profile is within acceptable bounds.',
  };
};

export const createRecommendation = ({
  bundle,
  forecast,
  availableActions,
}: TriageInput): RecoveryRecommendation => {
  const decision = buildTriage({ bundle, forecast, availableActions });
  const score = decision.urgencyScore;
  return parseRecommendation({
    recommendationId: `${bundle.bundleId}-triage-recommendation`,
    score,
    bucket: score >= 0.7 ? 'critical' : score >= 0.45 ? 'high' : score >= 0.25 ? 'medium' : 'low',
    rationale: decision.reason,
    actions: decision.selectedActions,
    predictedRiskReduction: roundTo(1 - score * 0.6, 3),
  });
};

const riskWeight = (signal: RecoverySignal): number => {
  const weights: Record<RecoverySignal['category'], number> = {
    availability: 0.5,
    latency: 0.25,
    dataQuality: 0.15,
    compliance: 0.1,
  };
  const ttlDecay = Math.max(0, 1 - (Date.now() - Date.parse(signal.ttlAt)) / 86_400_000);
  const normalizedSeverity = Math.max(0, Math.min(1, signal.severity));
  return normalizedSeverity * (weights[signal.category] ?? 0.1) * (1 + ttlDecay);
};
