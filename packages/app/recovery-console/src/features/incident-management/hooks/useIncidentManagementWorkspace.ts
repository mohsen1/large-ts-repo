import { useEffect, useMemo, useState, useCallback } from 'react';
import { InMemoryIncidentStore } from '@data/incident-hub';
import { withBrand } from '@shared/core';
import type { IncidentRecord } from '@domain/incident-management';
import { buildIncidentManagementRuntime } from '../services/incidentManagementRuntime';
import type { IncidentManagementViewFilters, IncidentManagementSummary, IncidentManagementWorkspaceState } from '../types';

export interface UseIncidentManagementWorkspaceArgs {
  readonly tenantId: string;
  readonly repository?: InMemoryIncidentStore;
}

interface SeedIncident {
  readonly tenantId: string;
  readonly serviceId: string;
  readonly incident: IncidentRecord;
}

export const useIncidentManagementWorkspace = ({
  tenantId,
  repository: providedRepository,
}: UseIncidentManagementWorkspaceArgs): {
  readonly state: IncidentManagementWorkspaceState;
  readonly actions: {
    readonly refresh: () => Promise<void>;
    readonly acknowledge: (incidentId: string) => void;
  };
} => {
  const repository = providedRepository ?? new InMemoryIncidentStore();
  const runtime = useMemo(() => buildIncidentManagementRuntime(repository), [repository]);
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<readonly IncidentRecord[]>([]);
  const [summary, setSummary] = useState<IncidentManagementSummary>({
    tenantId,
    totalOpen: 0,
    totalCritical: 0,
    avgReadiness: 0,
    alertCount: 0,
  });
  const [alerts, setAlerts] = useState<readonly string[]>([]);

  const hydrate = useCallback(async () => {
    setLoading(true);
    const result = await runtime.hydrate(withBrand(tenantId, 'TenantId'));
    setLoading(false);
    if (!result.ok) {
      setAlerts((prev) => [...prev, `hydrate-failed:${String(result.error)}`]);
      return;
    }

    setIncidents(result.value.incidents);
    setSummary(result.value.summary);
  }, [runtime, tenantId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const acknowledge = useCallback((incidentId: string) => {
    setAlerts((prev) => prev.filter((item) => !item.includes(incidentId)).concat(`ack:${incidentId}`));
  }, []);

  const state: IncidentManagementWorkspaceState = {
    loading,
    summary,
    incidents,
    alerts,
  };
  const actions = {
    refresh: hydrate,
    acknowledge,
  };

  return { state, actions };
};
