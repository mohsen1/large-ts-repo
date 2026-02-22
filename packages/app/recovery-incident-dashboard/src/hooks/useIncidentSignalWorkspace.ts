import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SignalRepository } from '@data/incident-signal-store';
import { createSignalDashboard, createSignalDashboardFromDefaults, type SignalDashboardView } from '@service/recovery-incident-orchestrator';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  type SignalEnvelope,
  type SignalRiskProfile,
  normalizeSignalRisk,
  buildDependencyGraph,
  type TenantId,
} from '@domain/incident-signal-intelligence';
import type { SignalEdge } from '@domain/incident-signal-intelligence';
import { buildEdgesFromSignals } from '@data/incident-signal-store';

interface IncidentSignalWorkspaceState {
  readonly tenantId: TenantId;
  readonly view: SignalDashboardView | null;
  readonly loading: boolean;
  readonly signals: readonly SignalEnvelope[];
  readonly riskProfiles: readonly SignalRiskProfile[];
  readonly topSignals: readonly string[];
  readonly projection: { readonly total: number; readonly critical: number; readonly high: number };
}

interface UseIncidentSignalWorkspaceResult {
  readonly state: IncidentSignalWorkspaceState;
  readonly refresh: () => Promise<void>;
  readonly refreshForTenant: (tenantId: TenantId) => Promise<void>;
  readonly topSignalIds: readonly string[];
}

const projectionFromSignals = (signals: readonly SignalEnvelope[]) => ({
  total: signals.length,
  critical: signals.filter((signal) => signal.risk === 'critical').length,
  high: signals.filter((signal) => signal.risk === 'high').length,
});

const buildPriorityLabels = (signals: readonly SignalRiskProfile[]): readonly string[] =>
  signals
    .slice()
    .sort((left, right) => right.impactScore - left.impactScore)
    .slice(0, 5)
    .map((entry) => `${entry.signalId}:${normalizeSignalRisk(entry.impactScore)}`);

export const useIncidentSignalWorkspace = (
  signalRepository: SignalRepository,
  incidentRepository: RecoveryIncidentRepository,
  seedTenantId: TenantId,
): UseIncidentSignalWorkspaceResult => {
  const [tenantId, setTenantId] = useState<TenantId>(seedTenantId);
  const [view, setView] = useState<SignalDashboardView | null>(null);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<readonly SignalEnvelope[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<readonly SignalRiskProfile[]>([]);

  const fallbackDashboard = useMemo(() => createSignalDashboardFromDefaults(), []);

  const refreshWithRepo = useCallback(async (targetTenant: TenantId) => {
    setLoading(true);
    try {
      const dashboard = createSignalDashboard(signalRepository, incidentRepository);
      const nextView = await dashboard.load(targetTenant);
      const nextSignals = await signalRepository.query({ filter: { tenantId: targetTenant } });
      const nextProfiles = await signalRepository.summarizeSignals(nextSignals.map((signal) => signal.id));
      const windows = await signalRepository.readWindows({ tenantId: targetTenant, signalKind: 'operational', from: new Date(Date.now() - 60_000).toISOString(), to: new Date().toISOString(), limit: 10 });
      const graphEdges: readonly SignalEdge[] = buildEdgesFromSignals(nextSignals).slice(0, 16);
      void buildDependencyGraph(nextSignals, graphEdges);
      void windows[0];
      setView(nextView);
      setSignals(nextSignals);
      setRiskProfiles(nextProfiles);
      setTenantId(targetTenant);
    } finally {
      setLoading(false);
    }
  }, [incidentRepository, signalRepository]);

  useEffect(() => {
    void refreshWithRepo(seedTenantId);
  }, [refreshWithRepo, seedTenantId]);

  const refresh = useCallback(async () => {
    await refreshWithRepo(tenantId);
  }, [tenantId, refreshWithRepo]);

  const topSignalIds = useMemo(() => buildPriorityLabels(riskProfiles), [riskProfiles]);

  return {
    state: {
      tenantId,
      view,
      loading,
      signals,
      riskProfiles,
      topSignals: topSignalIds,
      projection: projectionFromSignals(signals),
    },
    refresh,
    refreshForTenant: async (nextTenantId: TenantId) => {
      await refreshWithRepo(nextTenantId);
    },
    topSignalIds,
  };
};
