import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assembleRunbookRuntime,
  type QuantumPlan,
  type QuantumPolicy,
  type QuantumRunbook,
  type QuantumSignal,
  type QuantumTenantId,
} from '@domain/recovery-quantum-orchestration';
import {
  QuantumRunbookRepository,
  type QuantumQueryStats,
} from '@data/recovery-quantum-store';

export interface QuantumFilter {
  readonly tenant?: QuantumTenantId;
  readonly severity?: QuantumSignal['severity'];
  readonly includeIdle?: boolean;
}

export interface QuantumDashboard {
  readonly id: string;
  readonly tenant: string;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly policyCount: number;
  readonly signalCount: number;
}

const emptyRepo = new QuantumRunbookRepository();

const buildDashboard = (runbook: QuantumRunbook | undefined, status: QuantumDashboard['status']): QuantumDashboard | undefined =>
  runbook
    ? {
        id: String(runbook.id),
        tenant: String(runbook.tenant),
        status,
        policyCount: runbook.policies.length,
        signalCount: runbook.signals.length,
      }
    : undefined;

export interface UseRecoveryQuantumOrchestrationReturn {
  readonly dashboard?: QuantumDashboard;
  readonly runtimePlan?: QuantumPlan;
  readonly policies: readonly QuantumPolicy[];
  readonly signals: readonly QuantumSignal[];
  readonly loadError: string | undefined;
  readonly queryStats: QuantumQueryStats | undefined;
  readonly refresh: () => Promise<void>;
  readonly refreshSignals: (severity?: QuantumSignal['severity']) => Promise<void>;
}

const selectRunbook = async (
  tenant: QuantumTenantId,
  repository: QuantumRunbookRepository,
): Promise<{ runbook?: QuantumRunbook; stats?: QuantumQueryStats; error?: string }> => {
  const result = await repository.query({ tenant, includeIdle: true });
  if (result.runbooks.length === 0) {
    return { error: `No runbook found for tenant: ${tenant}` };
  }
  return {
    runbook: result.runbooks[0],
    stats: result.stats,
  };
};

const deriveRuntimeState = async (runbook: QuantumRunbook): Promise<{
  readonly plan: QuantumPlan;
  readonly tags: readonly string[];
}> => {
  const runtime = await assembleRunbookRuntime(runbook);
  return {
    plan: runtime.baselinePlan,
    tags: runtime.details.pluginKeys,
  };
};

export const useRecoveryQuantumOrchestration = (tenant: QuantumTenantId): UseRecoveryQuantumOrchestrationReturn => {
  const [status, setStatus] = useState<QuantumDashboard['status']>('idle');
  const [queryStats, setQueryStats] = useState<QuantumQueryStats | undefined>(undefined);
  const [dashboard, setDashboard] = useState<QuantumDashboard | undefined>(undefined);
  const [runtimePlan, setRuntimePlan] = useState<QuantumPlan | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [seedbook, setSeedbook] = useState<QuantumRunbook | undefined>(undefined);
  const [repository] = useState(() => emptyRepo);

  const selected = useMemo(() => {
    const latest = seedbook;
    if (!latest) {
      return {
        id: String(tenant),
        tenant: String(tenant),
        status,
        policyCount: 0,
        signalCount: 0,
      } satisfies QuantumDashboard;
    }
    const activeDashboard = buildDashboard(latest, status);
    if (activeDashboard) {
      return {
        ...activeDashboard,
        status,
      };
    }
    return {
      id: String(tenant),
      tenant: String(tenant),
      status,
      policyCount: 0,
      signalCount: 0,
    };
  }, [seedbook, status, tenant]);

  const refreshSignals = useCallback(
    async (severity?: QuantumSignal['severity']) => {
      if (!seedbook) {
        return;
      }
      const filtered = seedbook.signals.filter((signal) => !severity || signal.severity === severity);
      await repository.save(seedbook);
      setSeedbook({
        ...seedbook,
        signals: filtered,
      });
    },
    [repository, seedbook],
  );

  const load = useCallback(async () => {
    setStatus('loading');
    setError(undefined);
    const loaded = await selectRunbook(tenant, repository);
    if (loaded.error || !loaded.runbook) {
      setStatus('error');
      setError(loaded.error);
      return;
    }
    setQueryStats(loaded.stats);
    setSeedbook(loaded.runbook);
    const runtime = await deriveRuntimeState(loaded.runbook);
    setRuntimePlan(runtime.plan);
    setDashboard(buildDashboard(loaded.runbook, 'ready'));
    setStatus('ready');
  }, [repository, tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    dashboard: selected,
    runtimePlan,
    policies: seedbook?.policies ?? [],
    signals: seedbook?.signals ?? [],
    loadError: error,
    queryStats,
    refresh: load,
    refreshSignals,
  };
};
