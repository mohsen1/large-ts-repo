import { useCallback, useMemo, useState } from 'react';
import { makeRunId, makeTenantId, makeWorkspaceId } from '@domain/recovery-workbench-models';
import type { WorkbenchPhase } from '@domain/recovery-workbench-models';
import { runWorkbench, normalizePluginTrace, type WorkbenchExecutionResult } from '../services/workbenchService';
import type { WorkbenchControlState, WorkbenchSnapshot } from '../types';
import { RecoveryWorkbenchRoute } from '../types';

export interface RecoveryWorkbenchOrchestrationProps {
  readonly tenant: string;
  readonly workspace: string;
}

const allRoutes: readonly RecoveryWorkbenchRoute[] = [
  'route:all',
  'route:ingest',
  'route:transform',
  'route:score',
  'route:publish',
];
type AllRoutes = RecoveryWorkbenchRoute;

const emptySnapshot = (tenant: string, workspace: string): WorkbenchSnapshot => ({
  tenant,
  workspace,
  runId: 'none',
  status: 'idle',
  stage: 'ready',
  elapsedMs: 0,
  metadata: {},
  timeline: [],
});

const nextTick = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const resolveRoutes = (route: AllRoutes): readonly Exclude<RecoveryWorkbenchRoute, 'route:all'>[] =>
  route === 'route:all' ? allRoutes.filter((candidate): candidate is Exclude<RecoveryWorkbenchRoute, 'route:all'> => candidate !== 'route:all') : [route];

const derivePhases = (routes: readonly Exclude<RecoveryWorkbenchRoute, 'route:all'>[]): readonly WorkbenchPhase[] =>
  routes.map((route) => route.slice(6) as WorkbenchPhase);

export const useRecoveryWorkbenchOrchestration = ({
  tenant,
  workspace,
}: RecoveryWorkbenchOrchestrationProps): WorkbenchControlState & {
  readonly run: () => Promise<void>;
  readonly clear: () => void;
  readonly setRoute: (route: AllRoutes) => void;
} => {
  const [snapshots, setSnapshots] = useState<readonly WorkbenchSnapshot[]>([emptySnapshot(tenant, workspace)]);
  const [selectedRoute, setSelectedRoute] = useState<AllRoutes>(allRoutes[0]);
  const [results, setResults] = useState<WorkbenchControlState['results']>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);

  const run = useCallback(async () => {
    const runId = makeRunId(tenant, workspace, `${Date.now()}`);
    setLoading(true);

    const current = snapshots[snapshots.length - 1];
    const routes = resolveRoutes(selectedRoute);
    const startedAt = Date.now();
    const updated: WorkbenchSnapshot = {
      ...current,
      runId,
      stage: 'dispatch',
      status: 'running',
      elapsedMs: 0,
      timeline: ['starting', `routes=${routes.length}`],
      metadata: {
        startedAt,
        selectedRoute,
      },
    };

    setSnapshots((list) => [...list, updated]);

    const response = await runWorkbench({
      tenantId: makeTenantId(tenant),
      workspaceId: makeWorkspaceId(tenant, workspace),
      requestedBy: 'ui',
      phases: derivePhases(routes),
      routes,
      metadata: {
        ui: 'recovery-console',
        session: runId,
        routeHint: selectedRoute,
      },
    });

    if (response.kind === 'failure') {
      setLoading(false);
      setSnapshots((history) => [
        ...history,
        {
          ...updated,
          status: 'failed',
          stage: 'error',
          elapsedMs: Math.max(1, Date.now() - startedAt),
          timeline: [...updated.timeline, response.error.message],
          metadata: {
            ...updated.metadata,
            routeHint: selectedRoute,
            status: response.error.code,
          },
        },
      ]);
      return;
    }

    const output = response.output;
    const next: WorkbenchSnapshot = {
      ...updated,
      status: 'success',
      stage: 'completed',
      elapsedMs: output.totalDurationMs,
      score: output.traces.length,
      timeline: output.timeline,
      metadata: {
        ...updated.metadata,
        totalDurationMs: output.totalDurationMs,
      },
    };

    setResults(normalizePluginTrace(output));
    setSnapshots((history) => [...history, next]);
    setLoading(false);
    setRefreshing(true);
    setLastElapsedMs(next.elapsedMs);
    await nextTick(600);
    setRefreshing(false);
  }, [tenant, workspace, snapshots, selectedRoute]);

  const clear = useCallback(() => {
    setSnapshots([emptySnapshot(tenant, workspace)]);
    setResults([]);
    setLastElapsedMs(0);
  }, [tenant, workspace]);

  const setRoute = useCallback((route: AllRoutes) => {
    setSelectedRoute(route);
  }, []);

  const controlState: WorkbenchControlState = useMemo(
    () => ({
      loading,
      refreshing,
      snapshots,
      selectedRoute,
      results,
    }),
    [loading, refreshing, snapshots, selectedRoute, results],
  );

  return useMemo(
    () => ({
      ...controlState,
      run,
      clear,
      setRoute,
      lastElapsedMs,
    }),
    [controlState, run, clear, setRoute, lastElapsedMs],
  );
};
