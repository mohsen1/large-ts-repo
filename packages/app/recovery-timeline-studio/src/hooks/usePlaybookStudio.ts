import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ensureMemoryStore,
  getCatalogStats,
  inspectStudioRun,
  listStudioRunIds,
  startStudioRun,
} from '../services/recoveryPlaybookStudioAdapter';

interface PlaybookStudioState {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly selectedRunId: string | null;
  readonly runIds: readonly string[];
  readonly diagnostics: readonly string[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface PlaybookStudioActions {
  readonly selectTenant: (tenantId: string) => void;
  readonly selectWorkspace: (workspaceId: string) => void;
  readonly runStudio: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly inspect: () => Promise<void>;
  readonly reset: () => void;
}

const DEFAULT_TENANT = 'tenant-acme';
const DEFAULT_WORKSPACE = 'workspace-primary';

const initialState = (tenantId: string, workspaceId: string): PlaybookStudioState => ({
  tenantId,
  workspaceId,
  selectedRunId: null,
  runIds: [],
  diagnostics: [],
  isLoading: false,
  error: null,
});

export function usePlaybookStudio(): PlaybookStudioState & PlaybookStudioActions & { readonly catalogEntries: number; readonly hasCatalogEntries: boolean } {
  const [state, setState] = useState<PlaybookStudioState>(initialState(DEFAULT_TENANT, DEFAULT_WORKSPACE));
  ensureMemoryStore();
  const catalogState = getCatalogStats();

  const hydrate = useCallback(async (tenantId: string, workspaceId: string) => {
    setState((current) => ({ ...current, isLoading: true, error: null, tenantId, workspaceId }));
    const ids = await listStudioRunIds(tenantId);
    if (ids.error) {
      setState((current) => ({
        ...current,
        error: ids.error ?? null,
        isLoading: false,
        runIds: [],
      }));
      return;
    }
    setState((current) => ({
      ...current,
      runIds: ids.runIds,
      selectedRunId: ids.runIds.at(0) ?? null,
      isLoading: false,
    }));
  }, []);

  useEffect(() => {
    void hydrate(DEFAULT_TENANT, DEFAULT_WORKSPACE);
  }, [hydrate]);

  const runStudio = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    const response = await startStudioRun({
      scope: {
        tenantId: state.tenantId,
        workspaceId: state.workspaceId,
        tags: ['ui', 'orchestration'],
      },
      operator: `${state.tenantId}-operator`,
      input: {
        intent: 'simulate-recovery',
        requestedStages: ['discover', 'plan', 'simulate'],
      },
    });
    if (response.error) {
      const runError = response.error;
      setState((current) => ({ ...current, isLoading: false, error: runError }));
      return;
    }
    if (!response.snapshot) {
      setState((current) => ({ ...current, isLoading: false, error: 'empty-run-snapshot' }));
      return;
    }
    const snapshot = response.snapshot;
    setState((current) => {
      const runIds = current.runIds;
      const merged = [
        snapshot.runId,
        ...runIds,
      ].filter((entry, index, all) => all.indexOf(entry) === index).toSorted();
      return {
        ...current,
        error: null,
        runIds: merged,
        selectedRunId: snapshot.runId,
        diagnostics: [...current.diagnostics, ...snapshot.diagnostics],
        isLoading: false,
      };
    });
  }, [state.tenantId, state.workspaceId]);

  const selectTenant = useCallback((tenantId: string) => {
    void hydrate(tenantId, state.workspaceId);
  }, [hydrate, state.workspaceId]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    void hydrate(state.tenantId, workspaceId);
  }, [hydrate, state.tenantId]);

  const inspect = useCallback(async () => {
    if (!state.selectedRunId) {
      setState((current) => ({ ...current, error: 'no-run-selected' }));
      return;
    }
    const next = await inspectStudioRun(state.selectedRunId);
    if (next.error) {
      const inspectError = next.error;
      setState((current) => ({ ...current, error: inspectError }));
      return;
    }
    setState((current) => ({ ...current, diagnostics: next.diagnostics, error: null }));
  }, [state.selectedRunId]);

  const refresh = useCallback(async () => {
    await hydrate(state.tenantId, state.workspaceId);
  }, [hydrate, state.tenantId, state.workspaceId]);

  const reset = useCallback(() => {
    setState(initialState(state.tenantId, state.workspaceId));
  }, [state.tenantId, state.workspaceId]);

  return useMemo(
    () => ({
      ...state,
      selectTenant,
      selectWorkspace,
      runStudio,
      refresh,
      inspect,
      reset,
      catalogEntries: catalogState.entries,
      hasCatalogEntries: catalogState.hasEntries,
    }),
    [
      state,
      selectTenant,
      selectWorkspace,
      runStudio,
      refresh,
      inspect,
      reset,
      catalogState.entries,
      catalogState.hasEntries,
    ],
  );
}
