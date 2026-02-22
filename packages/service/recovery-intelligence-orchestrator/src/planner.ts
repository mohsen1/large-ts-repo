import { parseForecast, parseRecommendation, parseBundle } from '@domain/recovery-intelligence/src';
import { buildForecast, createRecommendation, proposeRecommendation, rankActions, suggestActionsFromSignals } from '@domain/recovery-intelligence/src';
import type {
  RecoveryActionCandidate,
  RecoveryForecast,
  RecoveryRecommendation,
  RecoverySignalBundle,
} from '@domain/recovery-intelligence/src';
import { buildPlanPayload } from '@data/recovery-intelligence-store/src/adapters';

export interface RecoveryPlanDraft {
  readonly bundle: RecoverySignalBundle;
  readonly forecast: RecoveryForecast;
  readonly recommendation: RecoveryRecommendation;
  readonly topActions: readonly RecoveryActionCandidate[];
}

export interface RecoveryPlanInputs {
  readonly bundle: RecoverySignalBundle;
  readonly expectedMinutes: number;
  readonly includeComplianceActions?: boolean;
}

export const compilePlan = ({
  bundle,
  expectedMinutes,
  includeComplianceActions = true,
}: RecoveryPlanInputs): RecoveryPlanDraft => {
  const parsed = parseBundle(bundle);
  const forecast = parseForecast(buildForecast(parsed, expectedMinutes));
  const candidateActions = suggestActionsFromSignals(parsed);
  const recommendation = expectedMinutes > 3
    ? parseRecommendation(createRecommendation({ bundle: parsed, forecast, availableActions: rankActions(candidateActions) }))
    : proposeRecommendation(parsed, expectedMinutes);

  const topActions = rankActions(candidateActions);
  if (!includeComplianceActions) {
    return {
      bundle: parsed,
      forecast,
      recommendation: parseRecommendation({
        ...recommendation,
        rationale: `${recommendation.rationale}; compliance actions omitted due policy override.`,
        actions: topActions,
      }),
      topActions,
    };
  }

  const payload = buildPlanPayload(parsed, topActions);
  if (!payload.ok) {
    throw payload.error;
  }
  return {
    bundle: parsed,
    forecast,
    recommendation,
    topActions,
  };
};
