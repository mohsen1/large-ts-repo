import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { SignalRepository } from '@data/incident-signal-store';
import { RecoveryIncidentRepository as IncidentRepoClass } from '@data/recovery-incident-store';
import { RecoveryIncidentAnalyticsOrchestrator } from '@service/recovery-incident-analytics-orchestrator';
import type { IncidentAnalyticsSnapshot } from '@domain/recovery-incident-analytics';
import { toKpiCard, toUiProjection, toUiRecommendations } from '@domain/recovery-incident-analytics';

export interface AnalyticsKpi {
  readonly tenantId: string;
  readonly totalSignals: number;
  readonly alertScore: number;
  readonly recommendationCount: number;
  readonly criticalAlerts: number;
}

export interface UseIncidentAnalyticsState {
  readonly snapshot: IncidentAnalyticsSnapshot | null;
  readonly loading: boolean;
  readonly kpis: AnalyticsKpi | null;
  readonly projections: readonly { windowStart: string; projectedMagnitude: number; risk: string }[];
  readonly recommendations: readonly {
    readonly id: string;
    readonly band: string;
    readonly trend: number;
    readonly confidence: number;
    readonly actionCount: number;
  }[];
  readonly refresh: () => Promise<void>;
  readonly runForFirstIncident: () => Promise<boolean>;
}

const readTenant = (repo: RecoveryIncidentRepository): string => {
  if ('scope' in (repo as unknown as Record<string, unknown>)) {
    return 'tenant-ops';
  }
  return 'tenant-ops';
};

export const useIncidentAnalytics = (incidentRepo: RecoveryIncidentRepository, signalRepo: SignalRepository): UseIncidentAnalyticsState => {
  const [snapshot, setSnapshot] = useState<IncidentAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<AnalyticsKpi | null>(null);

  const orchestrator = useMemo(
    () => new RecoveryIncidentAnalyticsOrchestrator({
      config: {
        tenantId: readTenant(incidentRepo),
        lookbackMinutes: 120,
        horizonMinutes: 60,
        minConfidence: 0.45,
        mode: 'overview',
      },
      dependencies: {
        signalRepo,
        incidentRepo: new IncidentRepoClass(),
      },
    }),
    [incidentRepo, signalRepo],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const evaluation = await orchestrator.refresh();
      if (evaluation.ok) {
        const nextSnapshot = evaluation.value.snapshot;
        setSnapshot(nextSnapshot);
        const uiKpi = toKpiCard(nextSnapshot);
        setKpis({
          tenantId: uiKpi.tenantId,
          totalSignals: uiKpi.totalSignals,
          alertScore: uiKpi.alertScore,
          recommendationCount: uiKpi.recommendationCount,
          criticalAlerts: uiKpi.criticalAlerts,
        });
      } else {
        setKpis({
          tenantId: readTenant(incidentRepo),
          totalSignals: 0,
          alertScore: 0,
          recommendationCount: 0,
          criticalAlerts: 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [orchestrator, incidentRepo]);

  const runForFirstIncident = useCallback(async () => {
    if (!snapshot?.matrix?.clusters?.length) {
      await refresh();
      return false;
    }
    const commandTarget = snapshot.matrix.clusters[0]?.signals?.[0];
    if (!commandTarget) {
      return false;
    }
    const result = await orchestrator.runForIncident(commandTarget as any);
    return result.ok;
  }, [orchestrator, refresh, snapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    snapshot,
    loading,
    kpis,
    projections: snapshot ? toUiProjection(snapshot.forecast) : [],
    recommendations: snapshot ? toUiRecommendations(snapshot).map((entry) => ({
      id: String(entry.id),
      band: entry.band,
      trend: entry.trend,
      confidence: entry.confidence,
      actionCount: entry.actions.length,
    })) : [],
    refresh,
    runForFirstIncident,
  };
};
