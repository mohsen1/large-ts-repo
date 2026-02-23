import { useMemo } from 'react';
import {
  CommandRunbook,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySimulationResult,
  TenantId,
  SeverityBand,
} from '@domain/recovery-stress-lab';
import {
  buildRecommendations,
  Recommendation,
  RecommendationBundle,
} from '@service/recovery-stress-lab-orchestrator';

interface Inputs {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly plan: OrchestrationPlan | null;
  readonly signals: readonly RecoverySignal[];
  readonly simulation: RecoverySimulationResult | null;
}

export interface RecommendationViewModel {
  readonly tenantId: TenantId;
  readonly priorityCount: number;
  readonly optionalCount: number;
  readonly summary: string;
  readonly grouped: {
    readonly byImpact: {
      readonly high: RecommendationBundle['topPriority'];
      readonly medium: RecommendationBundle['topPriority'];
      readonly low: RecommendationBundle['topPriority'];
    };
    readonly optional: RecommendationBundle['optional'];
  };
  readonly topCode: string;
}

const scoreSignalDensity = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) return 0;
  return signals.reduce((carry, signal) => {
    if (signal.severity === 'critical') return carry + 4;
    if (signal.severity === 'high') return carry + 3;
    if (signal.severity === 'medium') return carry + 2;
    return carry + 1;
  }, 0) / signals.length;
};

export const useStressLabRecommendations = ({ tenantId, band, runbooks, plan, signals, simulation }: Inputs): RecommendationViewModel => {
  const bundle = useMemo(() => {
    return buildRecommendations({
      tenantId,
      band,
      signals,
      runbooks,
      plan,
      simulation,
    });
  }, [tenantId, band, runbooks, plan, signals, simulation]);

  const grouped = useMemo(() => {
    const groupedRecommendations = {
      high: [] as Recommendation[],
      medium: [] as Recommendation[],
      low: [] as Recommendation[],
    };
    for (const recommendation of bundle.topPriority) {
      if (recommendation.impact === 'high') {
        groupedRecommendations.high.push(recommendation);
      } else if (recommendation.impact === 'medium') {
        groupedRecommendations.medium.push(recommendation);
      } else {
        groupedRecommendations.low.push(recommendation);
      }
    }
    return {
      byImpact: groupedRecommendations,
      optional: bundle.optional,
    };
  }, [bundle.topPriority, bundle.optional]);

  return {
    tenantId: bundle.tenantId,
    priorityCount: bundle.topPriority.length,
    optionalCount: bundle.optional.length,
    summary: `Band ${band} with density ${scoreSignalDensity(signals).toFixed(2)} produced ${bundle.topPriority.length} priorities`,
    grouped,
    topCode: bundle.topPriority[0]?.code ?? 'none',
  };
};
