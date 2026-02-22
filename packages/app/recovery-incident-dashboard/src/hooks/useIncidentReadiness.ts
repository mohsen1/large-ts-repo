import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryIncidentReadinessCoordinator } from '@service/recovery-incident-orchestrator';
import type { PortfolioReadiness, ReadinessWindow } from '@service/recovery-incident-orchestrator';

interface ReadinessHookState {
  readonly profile: PortfolioReadiness | undefined;
  readonly tenantReadiness: ReadonlyArray<ReadinessWindow>;
  readonly selectedTenant: string | undefined;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly errors: readonly string[];
}

export const useIncidentReadiness = (repo: RecoveryIncidentRepository) => {
  const coordinator = useMemo(() => new RecoveryIncidentReadinessCoordinator(repo), [repo]);
  const [state, setState] = useState<ReadinessHookState>({
    profile: undefined,
    tenantReadiness: [],
    selectedTenant: undefined,
    status: 'idle',
    errors: [],
  });

  const loadAll = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', errors: [] }));
    try {
      const profile = await coordinator.runAll();
      setState((current) => ({
        ...current,
        profile,
        tenantReadiness: profile.windows,
        selectedTenant: profile.windows[0]?.tenantId,
        status: 'ready',
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        errors: [
          ...current.errors,
          error instanceof Error ? error.message : 'ready check failed',
        ],
      }));
    }
  }, [coordinator]);

  const runTenant = useCallback(async (tenantId: string) => {
    try {
      const tenant = await coordinator.runTenantReadiness(tenantId);
      setState((current) => {
        const nextWindows = current.tenantReadiness.some((entry) => entry.tenantId === tenantId)
          ? current.tenantReadiness.map((entry) => (entry.tenantId === tenantId ? tenant : entry))
          : [...current.tenantReadiness, tenant];
        return {
          ...current,
          tenantReadiness: nextWindows,
          selectedTenant: tenantId,
        };
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        errors: [...current.errors, error instanceof Error ? error.message : `tenant check failed: ${tenantId}`],
      }));
    }
  }, [coordinator]);

  const runAutoCheck = useCallback(async (tenantId: string) => {
    const check = await coordinator.runAutoReadyCheck(tenantId);
    if (!check.ready) {
      await runTenant(tenantId);
    }
    return check;
  }, [coordinator, runTenant]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedWindow = state.selectedTenant == null
    ? undefined
    : state.tenantReadiness.find((entry) => entry.tenantId === state.selectedTenant);

  const readyRatio = useMemo(() => {
    if (state.tenantReadiness.length === 0) {
      return 0;
    }
    const totals = state.tenantReadiness.reduce((acc, window) => {
      const total = window.profile.summary.healthy + window.profile.summary.watch + window.profile.summary.degraded + window.profile.summary.critical;
      const ready = window.profile.summary.healthy + window.profile.summary.watch;
      return {
        total: acc.total + total,
        ready: acc.ready + ready,
      };
    }, { total: 0, ready: 0 });
    return totals.total === 0 ? 0 : totals.ready / totals.total;
  }, [state.tenantReadiness]);

  return {
    state,
    loadAll,
    runTenant,
    runAutoCheck,
    selectedWindow,
    selectTenant: (tenantId: string) => setState((current) => ({ ...current, selectedTenant: tenantId })),
    readyRatio,
  };
};
