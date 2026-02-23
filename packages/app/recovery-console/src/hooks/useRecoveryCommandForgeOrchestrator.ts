import { useCallback, useMemo, useState } from 'react';
import type { ForgeScenario } from '@domain/recovery-command-forge';
import {
  buildWorkspaceFromScenarios,
  collectWorkspaceWithFilters,
  runWorkspace,
  type ForgeWorkspace,
  type ForgeWorkspaceFilters,
} from '@service/recovery-command-forge-orchestrator';

export interface ForgeOrchestratorState {
  readonly workspace: ForgeWorkspace | undefined;
  readonly running: boolean;
  readonly filters: ForgeWorkspaceFilters;
  readonly selectedRunId: string | undefined;
  readonly lastError: string | undefined;
}

export interface ForgeOrchestratorActions {
  readonly run: () => Promise<void>;
  readonly filter: (nextFilters: Partial<ForgeWorkspaceFilters>) => void;
  readonly pickRun: (runId: string | undefined) => void;
  readonly reset: () => void;
}

export const useRecoveryCommandForgeOrchestrator = (
  tenant: string,
  scenarios: readonly ForgeScenario[],
): {
  state: ForgeOrchestratorState;
  actions: ForgeOrchestratorActions;
} => {
  const [workspace, setWorkspace] = useState<ForgeWorkspace | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<ForgeWorkspaceFilters>({ tenant: tenant, minPolicyScore: 0, onlyBlocked: false });

  const run = useCallback(async () => {
    setRunning(true);
    setError(undefined);

    const result = runWorkspace(tenant, scenarios, { policyGateEnabled: true, minConfidence: 35 });
    if (!result.ok) {
      setError(result.error.message);
      setWorkspace(undefined);
      setRunning(false);
      return;
    }

    const newWorkspace = buildWorkspaceFromScenarios(tenant, result.value.groups);
    const filtered = collectWorkspaceWithFilters(tenant, scenarios, filters);

    setWorkspace({
      ...newWorkspace,
      summary: filtered.summary,
      envelopes: filtered.envelopes,
    });
    setSelectedRunId(filtered.envelopes[0]?.runId);
    setRunning(false);
  }, [tenant, scenarios, filters]);

  const applyFilters = useCallback((nextFilters: Partial<ForgeWorkspaceFilters>) => {
    const merged = { ...filters, ...nextFilters };
    setFilters(merged);
    if (workspace) {
      const filtered = collectWorkspaceWithFilters(tenant, scenarios, merged);
      setWorkspace((current) =>
        current
          ? {
              ...current,
              summary: filtered.summary,
              envelopes: filtered.envelopes,
            }
          : current,
      );
    }
  }, [filters, workspace, tenant, scenarios]);

  const pickRun = useCallback((runId: string | undefined) => {
    setSelectedRunId(runId);
  }, []);

  const reset = useCallback(() => {
    setWorkspace(undefined);
    setSelectedRunId(undefined);
    setError(undefined);
    setFilters({ tenant, minPolicyScore: 0, onlyBlocked: false });
  }, [tenant]);

  const actions: ForgeOrchestratorActions = useMemo(
    () => ({
      run,
      filter: applyFilters,
      pickRun,
      reset,
    }),
    [run, applyFilters, pickRun, reset],
  );

  return {
    state: {
      workspace,
      running,
      filters,
      selectedRunId,
      lastError: error,
    },
    actions,
  };
};
