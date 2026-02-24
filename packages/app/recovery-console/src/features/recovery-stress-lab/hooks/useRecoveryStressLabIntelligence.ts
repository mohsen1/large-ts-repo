import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collectStressLabIntelligence,
  buildIntelligenceReport,
  type StressLabIntelligenceOrchestratorConfig,
  type StressLabIntelligenceOrchestrateResult,
} from '@service/recovery-stress-lab-orchestrator';
import {
  type ForecastSummary,
  type Recommendation,
} from '@domain/recovery-stress-lab-intelligence';
import { type OrchestrationPlan, type RecoverySimulationResult, createTenantId } from '@domain/recovery-stress-lab';

export interface StressLabIntelligenceModel {
  readonly tenantId: string;
  readonly configName: string;
  readonly running: boolean;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly summary: ForecastSummary | null;
  readonly recommendations: readonly Recommendation[];
  readonly error: string | null;
}

export const useRecoveryStressLabIntelligence = ({
  tenantId,
  runName,
  maxRecommendations,
  plan,
  simulation,
}: {
  tenantId: string;
  runName: string;
  maxRecommendations: number;
  plan: OrchestrationPlan;
  simulation: RecoverySimulationResult;
}) => {
  const [status, setStatus] = useState<StressLabIntelligenceModel['status']>('idle');
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [recommendations, setRecommendations] = useState<readonly Recommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const config = useMemo<StressLabIntelligenceOrchestratorConfig>(
    () => ({
      tenantId,
      runName,
      maxRecommendations,
    }),
    [tenantId, runName, maxRecommendations],
  );

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setRunning(true);

    try {
      const result = await collectStressLabIntelligence(config, plan, simulation);
      setSummary(result.bundle.summary);
      setRecommendations(result.bundle.recommendations);
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to collect intelligence');
      setStatus('error');
    } finally {
      setRunning(false);
    }
  }, [config, plan, simulation]);

  const buildSummary = useCallback(async (): Promise<string | null> => {
    try {
      return await buildIntelligenceReport(config, plan, simulation);
    } catch (cause) {
      return `error: ${cause instanceof Error ? cause.message : 'failed to summarize'}`;
    }
  }, [config, plan, simulation]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    tenantId,
    configName: config.runName,
    running,
    status,
    summary,
    recommendations,
    error,
    load,
    buildSummary,
    topPriorityCount: recommendations.filter((recommendation) =>
      recommendation.severity === 'critical' || recommendation.severity === 'high',
    ).length,
    phaseCount: recommendationPhaseCount(recommendations),
    summaryTenant: summary ? createTenantId(summary.tenantId) : null,
  };
};

const recommendationPhaseCount = (recommendations: readonly Recommendation[]): Record<string, number> =>
  recommendations.reduce<Record<string, number>>((acc, recommendation) => {
    const phase = recommendation.phase;
    acc[phase] = (acc[phase] ?? 0) + 1;
    return acc;
  }, {});
