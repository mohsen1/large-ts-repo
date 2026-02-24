import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SyntheticPluginDefinition,
  type SyntheticExecutionContext,
  type SyntheticRunInputModel,
  buildRuntimeContext,
} from '@domain/recovery-synthetic-orchestration';
import {
  InMemorySyntheticRunStore,
  type SyntheticRunRecord,
  type SyntheticStoreQuery,
} from '@data/recovery-synthetic-orchestration-store';
import {
  RecoverySyntheticOrchestrator,
  type OrchestratorConfig,
} from '@service/recovery-synthetic-orchestrator';

interface SyntheticWorkspaceState {
  readonly loading: boolean;
  readonly seedRunId: string;
  readonly runs: readonly SyntheticRunRecord[];
  readonly selected: string | undefined;
}

export interface SyntheticWorkspaceActions {
  runOnce: (tenantId: string, workspaceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  select: (runId: string | undefined) => void;
}

export interface SyntheticWorkspaceResult extends SyntheticWorkspaceState {
  readonly actions: SyntheticWorkspaceActions;
}

const initialQuery: SyntheticStoreQuery = {
  limit: 20,
  status: 'queued',
};

const createContext = (tenantId: string, workspaceId: string): SyntheticExecutionContext =>
  buildRuntimeContext({
    tenantId: tenantId as any,
    workspaceId: workspaceId as any,
    runId: `console:${tenantId}:${workspaceId}` as any,
    correlationId: `corr:${tenantId}:${workspaceId}` as any,
    actor: 'console-operator',
  });

const toRunInput = (requestedBy: string, priority: SyntheticRunInputModel['priority']): SyntheticRunInputModel => ({
  scenario: 'console-sim',
  constraints: { requestedBy, windowMs: 60_000 },
  requestedBy,
  priority,
});

export const useRecoverySyntheticOrchestrationWorkspace = (options: {
  tenantId?: string;
  workspaceId?: string;
  initial?: OrchestratorConfig;
}): SyntheticWorkspaceResult => {
  const tenant = options.tenantId ?? 'tenant-synthetic';
  const workspace = options.workspaceId ?? 'workspace-console';
  const store = useMemo(() => new InMemorySyntheticRunStore(), []);
  const orchestrator = useMemo(() => new RecoverySyntheticOrchestrator(store, options.initial), [options.initial, store]);

  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<readonly SyntheticRunRecord[]>([]);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [seedRunId, setSeedRunId] = useState<string>('seed:idle');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const result = await orchestrator.listRuns({
      tenantId: tenant as any,
      workspaceId: workspace as any,
      limit: initialQuery.limit,
    });

    if (!result.ok) {
      setRuns([]);
      setLoading(false);
      return;
    }

    setRuns(result.value);
    if (!selected) {
      setSelected(result.value[0]?.runId);
    }
    setLoading(false);
  }, [orchestrator, selected, tenant, workspace]);

  const runOnce = useCallback(async (tenantId: string, workspaceId: string) => {
    const context = createContext(tenantId, workspaceId);
    const input = toRunInput('console-operator', 'critical');
    const result = await orchestrator.runWorkspace(input, context);
    if (!result.ok) {
      setSeedRunId(`seed:error:${result.error.message}`);
      return;
    }

    setSeedRunId(result.value.runId);
    await loadRuns();
  }, [loadRuns, orchestrator]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) {
        return;
      }
      await loadRuns();
    })();

    const timer = setInterval(() => {
      void loadRuns();
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadRuns]);

  const actions = useMemo(
    () => ({
      runOnce,
      refresh: loadRuns,
      select: setSelected,
    }),
    [loadRuns, runOnce],
  );

  return {
    loading,
    seedRunId,
    runs,
    selected,
    actions,
  };
};
