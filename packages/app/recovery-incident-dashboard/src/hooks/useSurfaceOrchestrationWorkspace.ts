import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { SurfaceLaneKind } from '@shared/recovery-orchestration-surface';
import { SurfaceWorkspaceService } from '../services/orchestrationSurfaceService';
import {
  toTaggedSummary,
  type SurfaceSummary,
  type SurfaceWorkspaceState,
} from '../types/recoveryOrchestrationSurface';

type Row = {
  readonly key: string;
  readonly ok: boolean;
  readonly latency: number;
};

type HookState = {
  readonly workspace: SurfaceWorkspaceState | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
};

type Action =
  | { readonly type: 'boot'; readonly payload: SurfaceWorkspaceState }
  | { readonly type: 'run'; readonly payload: SurfaceWorkspaceState }
  | { readonly type: 'loading' }
  | { readonly type: 'error'; readonly error: string };

const reducer = (state: HookState, action: Action): HookState => {
  switch (action.type) {
    case 'boot':
      return { ...state, workspace: action.payload, loading: false, error: undefined };
    case 'run':
      return { ...state, workspace: action.payload, loading: false, error: undefined };
    case 'loading':
      return { ...state, loading: true, error: undefined };
    case 'error':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
};

const countKinds = (workspace: SurfaceWorkspaceState) => ({
  ingest: workspace.records.filter((record) => record.pluginId.includes('ingest')).length,
  synthesize: workspace.records.filter((record) => record.pluginId.includes('synthesize')).length,
  simulate: workspace.records.filter((record) => record.pluginId.includes('simulate')).length,
  score: workspace.records.filter((record) => record.pluginId.includes('score')).length,
  actuate: workspace.records.filter((record) => record.pluginId.includes('actuate')).length,
});

export const useSurfaceOrchestrationWorkspace = (seed: string) => {
  const serviceRef = useRef(new SurfaceWorkspaceService(seed));
  const [state, dispatch] = useReducer(reducer, {
    workspace: undefined,
    loading: false,
    error: undefined,
  } as HookState);

  const buildSummary = useCallback((workspace: SurfaceWorkspaceState): SurfaceSummary => {
    const counts = countKinds(workspace);

    const workspaceSummary: SurfaceSummary = {
      laneCount: Object.keys(counts).length,
      pluginCount: workspace.records.length,
      pluginCountByKind: counts,
      workspace: workspace.workspace,
      pluginKinds: [...new Set(workspace.records.map((record) => record.pluginId.split(':')[1] ?? 'unknown'))],
      tags: ['derived', workspace.workspace.status],
    };

    return toTaggedSummary(workspaceSummary);
  }, []);

  const boot = useCallback(async (): Promise<void> => {
    dispatch({ type: 'loading' });
    try {
      const workspace = await serviceRef.current.bootstrap();
      dispatch({ type: 'boot', payload: workspace });
    } catch (error) {
      dispatch({ type: 'error', error: String(error) });
    }
  }, []);

  const run = useCallback(async (kind: SurfaceLaneKind): Promise<void> => {
    dispatch({ type: 'loading' });
    try {
      const updated = await serviceRef.current.run(kind, {
        requestedAt: Date.now(),
      });
      dispatch({ type: 'run', payload: updated });
    } catch (error) {
      dispatch({ type: 'error', error: String(error) });
    }
  }, []);

  const workspace = state.workspace;
  const summary = useMemo(() => workspace && buildSummary(workspace), [buildSummary, workspace]);

  const statuses = useMemo<Row[]>(
    () =>
      (workspace?.records
        .toSorted((left, right) => (left.ok === right.ok ? 0 : left.ok ? -1 : 1))
        .map<Row>((record) => ({
          key: record.pluginId,
          ok: record.ok,
          latency: record.latency,
        })) ?? []),
    [workspace?.records],
  );

  return {
    workspace,
    workspaceId: workspace?.workspace.workspaceId,
    loading: state.loading,
    error: state.error,
    boot,
    run,
    statuses,
    summary,
    seed,
    zone: workspace?.workspace.zone ?? 'us-east-1',
  } satisfies {
    workspace: SurfaceWorkspaceState | undefined;
    workspaceId: string | undefined;
    loading: boolean;
    error: string | undefined;
    boot: () => Promise<void>;
    run: (kind: SurfaceLaneKind) => Promise<void>;
    statuses: Row[];
    summary: SurfaceSummary | undefined;
    seed: string;
    zone: string;
  };
};
