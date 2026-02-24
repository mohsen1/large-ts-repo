import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { ArcanePlugin, ArcanePluginKind } from '../types';
import { createArcaneRegistry } from '../registry';
import { summarizeRuntimeEvents, runArcaneWorkflow } from '../runtime';
import {
  arcaneStateFromTenant,
  formatTimeline,
  pruneEvents,
  reduceWorkspaceActions,
  summarizeKinds,
  toPluginKinds,
} from '../state';
import { createArcaneSessionId } from '../types';

interface ArcaneLabWorkspaceHookArgs {
  readonly tenantId: string;
  readonly autoRefreshMs?: number;
}

interface ArcaneLabWorkspaceHookResult {
  readonly workspace: ReturnType<typeof arcaneStateFromTenant>;
  readonly timeline: readonly string[];
  readonly catalogSummary: readonly string[];
  readonly selectedKinds: readonly ArcanePluginKind[];
  readonly isRunning: boolean;
  readonly start: (catalog: readonly ArcanePlugin[]) => Promise<void>;
  readonly stop: () => void;
  readonly toggleKind: (kind: ArcanePluginKind) => void;
  readonly emit: (eventKind: 'workspace/start' | 'workspace/stop' | 'plugin/selected' | 'plugin/filtered' | 'workspace/refresh') => void;
}

type ArcaneWorkspaceState = ReturnType<typeof arcaneStateFromTenant>;

type ArcaneWorkspaceAction = ReturnType<typeof reduceWorkspaceActions>;

export const useArcaneLabWorkspace = ({
  tenantId,
  autoRefreshMs = 0,
}: ArcaneLabWorkspaceHookArgs): ArcaneLabWorkspaceHookResult => {
  const [snapshot, dispatch] = useReducer(reduceWorkspaceActions, tenantId, arcaneStateFromTenant);

  const timeline = useMemo(() => formatTimeline(pruneEvents(snapshot.events, 120)), [snapshot.events]);

  useEffect(() => {
    const events = summarizeKinds(snapshot.workspace).map((event) => ({
      id: `${event.type}-${Date.now()}`,
      type: event.type,
      workspaceId: snapshot.workspace.workspaceId,
      at: event.at,
      tenantId: snapshot.workspace.tenantId,
      payload: event.payload,
    }));
    dispatch({ type: 'events', payload: events });
  }, [snapshot.workspace.workspaceId, snapshot.workspace.signalIds.length, snapshot.workspace.runbookIds.length]);

  useEffect(() => {
    if (autoRefreshMs <= 0) {
      return;
    }

    const timerId = setInterval(() => {
      dispatch({
        type: 'event',
        event: {
          type: 'workspace/refresh',
          tenantId: snapshot.workspace.tenantId,
          workspaceId: snapshot.workspace.workspaceId,
          at: new Date().toISOString(),
          payload: {
            reason: 'auto-refresh',
          },
        },
      });
    }, autoRefreshMs);

    return () => {
      clearInterval(timerId);
    };
  }, [autoRefreshMs, snapshot.workspace.tenantId, snapshot.workspace.workspaceId]);

  const catalogSummary = useMemo(() => {
    const registry = createArcaneRegistry([] as const);
    const manifest = registry.manifest();
    return Object.entries(manifest).map(([kind, plugins]) => `${kind}:${plugins.length}`);
  }, []);

  const selectedKinds = snapshot.workspace.selectedPluginKinds;

  const emit = useCallback(
    (kind: 'workspace/start' | 'workspace/stop' | 'plugin/selected' | 'plugin/filtered' | 'workspace/refresh') => {
      dispatch({
        type: 'event',
        event: {
          type: kind,
          tenantId: snapshot.workspace.tenantId,
          workspaceId: snapshot.workspace.workspaceId,
          at: new Date().toISOString(),
          payload: {
            reason: kind,
          },
        },
      });
    },
    [snapshot.workspace.tenantId, snapshot.workspace.workspaceId],
  );

  const start = useCallback(
    async (catalog: readonly ArcanePlugin[]) => {
      emit('workspace/start');
      const sortedCatalog = [...catalog].sort((left, right) => right.manifest.priority - left.manifest.priority);
      const dominantKind = (snapshot.workspace.selectedPluginKinds[0] ?? 'policy') as never;
      const result = await runArcaneWorkflow(
        sortedCatalog as never,
        dominantKind,
        snapshot.workspace,
        [],
      );

      const diagnostics = summarizeRuntimeEvents(
        {
          workspace: snapshot.workspace,
          registry: createArcaneRegistry(sortedCatalog),
          status: 'running',
          activeSession: createArcaneSessionId(`${snapshot.workspace.sessionId}:start`),
          createdAt: new Date().toISOString(),
        },
      );

      dispatch({
        type: 'events',
        payload: diagnostics.map((line, index) => ({
          id: `diag-${index}`,
          type: 'workspace/refresh',
          workspaceId: snapshot.workspace.workspaceId,
          at: new Date().toISOString(),
          tenantId: snapshot.workspace.tenantId,
          payload: {
            line,
            phase: result.trace.id,
          },
        })),
      });

      dispatch({
        type: 'replace',
        workspace: result.workspace,
      });
    },
    [emit, snapshot.workspace],
  );

  const stop = useCallback(() => {
    emit('workspace/stop');
    dispatch({
      type: 'event',
      event: {
        type: 'workspace/stop',
        tenantId: snapshot.workspace.tenantId,
        workspaceId: snapshot.workspace.workspaceId,
        at: new Date().toISOString(),
        payload: {
          reason: 'manual-stop',
        },
      },
    });
  }, [emit, snapshot.workspace.tenantId, snapshot.workspace.workspaceId]);

  const toggleKind = useCallback(
    (kind: ArcanePluginKind) => {
      const next = snapshot.workspace.selectedPluginKinds.includes(kind)
        ? snapshot.workspace.selectedPluginKinds.filter((entry) => entry !== kind)
        : [...snapshot.workspace.selectedPluginKinds, kind];

      dispatch({
        type: 'select-kinds',
        kinds: next,
      });
    },
    [snapshot.workspace.selectedPluginKinds],
  );

  return {
    workspace: snapshot,
    timeline,
    catalogSummary,
    selectedKinds,
    isRunning: snapshot.running,
    start,
    stop,
    toggleKind,
    emit,
  };
};
