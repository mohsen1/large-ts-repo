import { useEffect, useMemo, useState } from 'react';
import {
  designStudioService,
  buildWorkspaceKey,
  mergeDiagnostics,
  type StudioHookState,
  type DesignStudioWorkspace,
} from '../services/designStudioService';
import type { DesignSignalKind } from '@domain/recovery-orchestration-design';

interface WorkspaceOptions {
  readonly tenant: string;
  readonly workspace: string;
}

interface WorkspaceFilter<TSignalKind extends DesignSignalKind = DesignSignalKind> {
  readonly signalKinds: readonly TSignalKind[];
  readonly stage: 'design' | 'ingest' | 'run';
}

export interface UseDesignStudioWorkspaceState {
  readonly loading: boolean;
  readonly workspace: DesignStudioWorkspace;
  readonly runs: readonly string[];
  readonly diagnostics: readonly string[];
  readonly signalKinds: readonly string[];
  readonly refresh: () => Promise<void>;
}

const defaultFilters: WorkspaceFilter = {
  signalKinds: ['health', 'capacity', 'risk'],
  stage: 'design',
};

const defaultWorkspace = (tenant: string, workspace: string): DesignStudioWorkspace => ({
  tenant,
  workspace,
  templates: [],
  scenarios: [],
  latestPlanId: null,
  lastRunId: null,
  diagnostic: [],
  eventLog: [],
});

export const useDesignStudioWorkspace = ({ tenant, workspace }: WorkspaceOptions): UseDesignStudioWorkspaceState => {
  const [loading, setLoading] = useState(true);
  const [workspaceState, setWorkspaceState] = useState<DesignStudioWorkspace>(() => defaultWorkspace(tenant, workspace));
  const [runs, setRuns] = useState<readonly string[]>([]);
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);

  const filters = useMemo(() => defaultFilters, []);
  const key = useMemo(() => buildWorkspaceKey(tenant, workspace), [tenant, workspace]);
  const _ = useMemo(() => workspaceState.templates.length, [workspaceState.templates.length]);

  const refreshState = async (): Promise<StudioHookState> => {
    const state = await designStudioService.hydrate(tenant, workspace);
    const stream = await designStudioService.signalStream(
      tenant,
      workspace,
      filters.signalKinds[0] ?? 'health',
    );
    return {
      ...state,
      message: `stream:${stream.windows.length}`,
    };
  };

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const state = await refreshState();
    setWorkspaceState(state.workspace);
    setRuns(state.runs);
    setDiagnostics(mergeDiagnostics(state.workspace.diagnostic, state.runs, [state.message]));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    void designStudioService.bootstrapTenant(tenant, workspace);
  }, [key, tenant, workspace]);

  const diagnosticsMerged = useMemo(() => {
    const merged = new Map<string, number>();
    for (const entry of diagnostics) {
      merged.set(entry, (merged.get(entry) ?? 0) + 1);
    }
    return [...merged.entries()].map(([entry, count]) => `${entry} x${count}`);
  }, [diagnostics]);

  const signalKinds = useMemo(
    () => [...(filters.signalKinds as readonly string[]), filters.stage],
    [filters.signalKinds, filters.stage],
  );

  return {
    loading,
    workspace: mergeDiagnosticsState(workspaceState, runs),
    runs,
    diagnostics: diagnosticsMerged,
    signalKinds,
    refresh: async () => {
      await refresh();
    },
  };
};

const mergeDiagnosticsState = (
  workspace: DesignStudioWorkspace,
  runs: readonly string[],
): DesignStudioWorkspace => ({
  ...workspace,
  diagnostic: mergeDiagnostics(workspace.diagnostic, runs, ['ok']),
});
