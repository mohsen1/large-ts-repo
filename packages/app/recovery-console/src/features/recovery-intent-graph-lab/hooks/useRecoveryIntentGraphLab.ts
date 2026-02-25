import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IntentRoute, IntentLabWorkspaceState, IntentLabRoute, IntentFormState } from '../types';
import {
  loadWorkspace,
  executeGraph,
  listDefaultPlugins,
  type WorkspaceSummary,
  type ServiceSignal,
  type ServiceConfig,
  type WorkspaceIntentRequest,
} from '../services/intentGraphService';
import {
  makeDefaultFormState,
  makeDefaultState,
  toWorkspaceSummary,
  toIntentNodeRows,
  toIntentEdges,
  intentRouteUnion,
} from '../types';
import type { IntentGraphSnapshot } from '@shared/recovery-intent-graph-runtime';

interface UseRecoveryIntentGraphLabProps {
  readonly tenant: string;
  readonly workspace: string;
  readonly route: IntentRoute;
}

export interface UseRecoveryIntentGraphLabState {
  readonly workspace: IntentLabWorkspaceState;
  readonly summary: WorkspaceSummary;
  readonly signals: readonly ServiceSignal[];
  readonly route: IntentLabRoute;
  readonly pluginNames: readonly string[];
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly form: IntentFormState;
}

export interface UseRecoveryIntentGraphLabActions {
  readonly refresh: () => Promise<void>;
  readonly execute: () => Promise<void>;
  readonly reset: () => void;
  readonly setRoute: (route: IntentRoute) => void;
  readonly setThrottle: (value: number) => void;
  readonly setIncludeDiagnostics: (value: boolean) => void;
  readonly toggleDiagnostics: () => void;
}

export const useRecoveryIntentGraphLab = ({
  tenant,
  workspace,
  route,
}: UseRecoveryIntentGraphLabProps): UseRecoveryIntentGraphLabState & UseRecoveryIntentGraphLabActions => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<WorkspaceSummary>({
    route: route,
    routeNodes: 0,
    routeEdges: 0,
    score: 0,
    topologicalDepth: 0,
  });
  const [workspaceState, setWorkspaceState] = useState<IntentLabWorkspaceState>(makeDefaultState());
  const [signals, setSignals] = useState<readonly ServiceSignal[]>([]);
  const [pluginNames, setPluginNames] = useState<readonly string[]>(listDefaultPlugins());
  const [error, setError] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<IntentFormState>(makeDefaultFormState(tenant, workspace));
  const [activeRoute, setActiveRoute] = useState<IntentRoute>(route);

  const normalizeForm = useCallback((next: Partial<IntentFormState>): void => {
    setForm((previous) => ({
      ...previous,
      ...next,
    }));
  }, []);

  const setRoute = useCallback((next: IntentRoute) => {
    setActiveRoute(next);
    normalizeForm({ selectedRoute: next });
  }, [normalizeForm]);

  const setThrottle = useCallback((value: number) => {
    const next = Math.max(50, Math.min(2_000, Number.isFinite(value) ? Math.round(value) : 250));
    normalizeForm({ throttleMs: next });
  }, [normalizeForm]);

  const setIncludeDiagnostics = useCallback((value: boolean) => {
    normalizeForm({ includeDiagnostics: value });
  }, [normalizeForm]);

  const toggleDiagnostics = useCallback(() => {
    setIncludeDiagnostics(!form.includeDiagnostics);
  }, [form.includeDiagnostics, setIncludeDiagnostics]);

  const buildConfig = useCallback(
    (): ServiceConfig => ({
      tenant: form.tenant,
      workspace: form.workspace,
      route: activeRoute,
      throttleMs: form.throttleMs,
    }),
    [activeRoute, form.tenant, form.workspace, form.throttleMs],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const request: WorkspaceIntentRequest = {
        config: buildConfig(),
      };

      const loaded = await loadWorkspace(request);
      const { summary, snapshot, signals: nextSignals, routeState } = loaded;
      const nodes = toIntentNodeRows(snapshot);
      const edges = toIntentEdges(snapshot);
      const pluginNames = routeState.plugins.map((plugin) => plugin.name);

      setSummary(summary);
      setSignals(nextSignals);
      setPluginNames(pluginNames);
      setWorkspaceState((previous) => ({
        ...previous,
        route: loaded.workspace.route,
        status: 'idle',
        active: false,
        nodes,
        edges,
        pluginNames,
        signalCount: nextSignals.length,
        messages: [
          ...previous.messages.slice(-24),
          `Loaded graph ${snapshot.name}`,
          `Score ${summary.score.toFixed(2)}`,
        ],
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'failed-to-load');
      setWorkspaceState((previous) => ({ ...previous, status: 'failed', active: false, nodes: [], edges: [] }));
    } finally {
      setLoading(false);
    }
  }, [buildConfig, form.includeDiagnostics]);

  const execute = useCallback(async () => {
    const requestedRoute = activeRoute;
    const config = buildConfig();
    setLoading(true);
    setError(undefined);
    setWorkspaceState((previous) => ({ ...previous, status: 'running', active: true }));
    try {
      const result = await executeGraph(config, {
        name: requestedRoute,
        nodes: [],
        edges: [],
        tags: {
          route: requestedRoute,
          tenant: tenant,
          workspace: workspace,
          score: '0',
        },
      });
      setSignals(result.emittedSignals as unknown as readonly ServiceSignal[]);
      const snapshotSummary = toWorkspaceSummary(result.output);

      setWorkspaceState((previous) => ({
        ...previous,
        status: 'completed',
        active: false,
        signalCount: result.emittedSignals.length,
        route: requestedRoute,
        nodes: toIntentNodeRows(result.output),
        edges: toIntentEdges(result.output),
        messages: [
          ...previous.messages.slice(-24),
          `Execute completed in ${result.runtimeMs}ms`,
          `Route ${requestedRoute}`,
          `Score ${snapshotSummary.score}`,
        ],
      }));
      setSummary(snapshotSummary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'execution-failed');
      setWorkspaceState((previous) => ({ ...previous, status: 'failed', active: false }));
    } finally {
      setLoading(false);
    }
  }, [activeRoute, buildConfig, tenant, workspace]);

  const reset = useCallback(() => {
    setWorkspaceState((previous) => ({
      ...makeDefaultState(),
      tenant: tenant as never,
      workspace: workspace as never,
      route: activeRoute,
      messages: [...previous.messages.slice(-8), 'state reset'],
    }));
    setSignals([]);
    setSummary({
      route: activeRoute,
      routeNodes: 0,
      routeEdges: 0,
      score: 0,
      topologicalDepth: 0,
    });
  }, [tenant, workspace, activeRoute]);

  useEffect(() => {
    void refresh();
  }, [tenant, workspace, activeRoute, refresh]);

  const computedRoute = useMemo(
    () => `intent-graph-lab/${form.includeDiagnostics ? 'overview' : 'signals'}` as IntentLabRoute,
    [form.includeDiagnostics],
  );

  return {
    workspace: workspaceState,
    summary,
    signals,
    route: computedRoute,
    pluginNames,
    loading,
    error,
    form: {
      ...form,
      selectedRoute: activeRoute,
      tenant,
      workspace,
      throttleMs: Number.isFinite(form.throttleMs) ? form.throttleMs : 250,
    },
    refresh,
    execute,
    reset,
    setRoute,
    setThrottle,
    setIncludeDiagnostics,
    toggleDiagnostics,
  };
};
