import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { buildTenantRunIndex, buildIncidentSignalIndex } from '@data/recovery-incident-store';
import { buildRepositoryPortfolio } from '@data/recovery-incident-store';
import type { IncidentQuery } from '@data/recovery-incident-store';

export interface ReadinessMetric {
  readonly tenantId: string;
  readonly openRatio: number;
  readonly incidentCount: number;
  readonly runCount: number;
}

export interface ReadinessSignal {
  readonly incidentId: string;
  readonly topSignals: readonly string[];
  readonly signalDensity: number;
}

export interface ReadinessWorkspaceState {
  readonly loading: boolean;
  readonly metrics: readonly ReadinessMetric[];
  readonly signals: readonly ReadinessSignal[];
  readonly selectedTenant?: string;
  readonly snapshotLabel: string;
}

export interface ReadinessWorkspaceActions {
  readonly selectTenant: (tenantId: string) => void;
  readonly refresh: () => Promise<void>;
  readonly querySignals: (incidentQuery: IncidentQuery) => Promise<readonly ReadinessSignal[]>;
}

export const useRecoveryReadinessWorkspace = (repository: RecoveryIncidentRepository) => {
  const [state, setState] = useState<ReadinessWorkspaceState>({
    loading: false,
    metrics: [],
    signals: [],
    snapshotLabel: 'initial',
  });

  const computeState = useCallback(async (tenantId?: string) => {
    setState((previous) => ({ ...previous, loading: true }));
    const snapshot = await repository.snapshot();
    const incidents = snapshot.incidents.map((entry) => entry.incident);
    const runs = snapshot.runs.map((entry) => entry.run);
    const plans = snapshot.plans.map((entry) => entry.plan);
    const query = await buildRepositoryPortfolio(repository);
    const metrics = buildTenantRunIndex(incidents, runs).map((entry) => ({
      tenantId: entry.tenantId,
      openRatio: entry.openIncidentRatio,
      incidentCount: entry.incidentCount,
      runCount: entry.runCount,
    }));
    const topTenant = metrics.find((entry) => tenantId === undefined || entry.tenantId === tenantId) ?? metrics[0];
    const signals = buildIncidentSignalIndex(incidents, {
      tenantId: topTenant?.tenantId,
      limit: 12,
    });
    const selectedTenant = topTenant?.tenantId;
    const snapshotLabel = `${query.tenants.length} tenants / ${plans.length} plans / ${runs.length} runs`;
    setState({
      loading: false,
      metrics,
      signals,
      selectedTenant,
      snapshotLabel,
    });
  }, [repository]);

  const selectTenant = useCallback((tenantId: string) => {
    setState((previous) => ({ ...previous, selectedTenant: tenantId }));
    void computeState(tenantId);
  }, [computeState]);

  const querySignals = useCallback(async (incidentQuery: IncidentQuery): Promise<readonly ReadinessSignal[]> => {
    const snapshot = await repository.snapshot();
    const incidents = snapshot.incidents.map((entry) => entry.incident);
    return buildIncidentSignalIndex(incidents, {
      tenantId: incidentQuery.tenantId,
      serviceName: incidentQuery.serviceName,
      severityGte: incidentQuery.severityGte,
      limit: incidentQuery.limit,
      labels: incidentQuery.labels,
      unresolvedOnly: incidentQuery.unresolvedOnly,
      region: incidentQuery.region,
    });
  }, [repository]);

  useEffect(() => {
    void computeState(state.selectedTenant);
  }, [computeState, state.selectedTenant]);

  return useMemo(() => ({
    state,
    actions: { selectTenant, refresh: () => computeState(state.selectedTenant), querySignals } as ReadinessWorkspaceActions,
  }), [state, selectTenant, computeState, querySignals]);
};
