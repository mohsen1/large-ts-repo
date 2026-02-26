import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { BranchContext } from '@shared/type-level/stress-huge-controlflow';
import {
  controlFlowNesting,
  executeControlFlow,
  runGraph,
  type GraphStepResult,
  type GraphPhase,
} from '@shared/type-level/stress-huge-controlflow';
import {
  broadConditionalPipeline,
  routeCatalogEnvelope,
  type ChainResolve,
  type OrchestratorRoute,
  type RouteUnionEnvelope,
} from '@shared/type-level/stress-broad-conditional';
import { parseRoute, type TscMode, type TscWorkspaceActionUnion, type TscWorkspaceState, buildWorkspaceState } from '../types';

type EvaluatedRoute = RouteUnionEnvelope<[OrchestratorRoute]>[number] | ChainResolve<OrchestratorRoute>;

interface WorkspaceRuntimeState {
  readonly routes: readonly OrchestratorRoute[];
  readonly routeEvaluations: readonly EvaluatedRoute[];
  readonly activePhase: GraphPhase;
  readonly graph: Record<string, GraphStepResult>;
  readonly logs: readonly string[];
  readonly diagnostics: readonly GraphStepResult[];
  readonly status: TscWorkspaceState['status'];
  readonly priorityScore: number;
  readonly lastError?: string;
}

const initialState = (tenant: string, mode: TscMode): WorkspaceRuntimeState => {
  const baseRoutes = [
    'recovery/run/running/reco-12345-abcdef12',
    'signal/simulate/enqueued/sigx-12345-abcd1234',
    'policy/validate/finished/poli-12345-0000abcd',
    'fleet/repair/running/fleet-12345-ffff1111',
    'catalog/sync/created/catalog-54321-bcde1234',
  ] as const satisfies readonly OrchestratorRoute[];

  const evaluated = routeCatalogEnvelope(baseRoutes) as unknown as readonly EvaluatedRoute[];
  const graph = runGraph(tenant, 'zone-a');

  return {
    routes: baseRoutes,
    routeEvaluations: evaluated,
    activePhase: 'phase_01_boot',
    graph,
    logs: ['boot', `tenant=${tenant}`, `mode=${mode}`],
    diagnostics: Object.values(graph),
    status: 'idle',
    priorityScore: 0,
  };
};

type Action =
  | { type: 'bootstrap'; tenant: string; mode: TscMode }
  | { type: 'activate'; phase: GraphPhase; route: OrchestratorRoute }
  | { type: 'advance'; override?: boolean; event?: BranchContext }
  | { type: 'select'; route: OrchestratorRoute }
  | { type: 'error'; message: string }
  | { type: 'clear' }
  | { type: 'metrics'; route: OrchestratorRoute; metrics: { readonly latencyMs: number } };

const reducer = (state: WorkspaceRuntimeState, action: Action): WorkspaceRuntimeState => {
  switch (action.type) {
    case 'bootstrap': {
      const logs = [...state.logs, `bootstrap:${action.tenant}:${action.mode}`];
      return { ...state, status: 'warming', logs, diagnostics: [...state.diagnostics], activePhase: 'phase_01_boot' };
    }
    case 'activate': {
      const context: BranchContext = {
        tenant: action.route,
        zone: 'zone-a',
        severity: 2,
        attempt: 1,
        budgetMs: 2000,
      };
      const next = executeControlFlow(context, action.phase);
      const routeState = parseRoute(action.route);
      const payload = broadConditionalPipeline(action.route);
      return {
        ...state,
        diagnostics: [...state.diagnostics, next],
        priorityScore: state.diagnostics.length + 1,
        logs: [...state.logs, `activate:${action.phase}:${routeState.key}`],
        status: next.accepted ? 'active' : 'suspended',
        activePhase: next.accepted ? (next.next ?? state.activePhase) : state.activePhase,
        routeEvaluations: [...state.routeEvaluations, payload] as WorkspaceRuntimeState['routeEvaluations'],
      };
    }
    case 'advance': {
      const context = action.event ?? {
        tenant: 'tenant',
        zone: 'zone-a',
        severity: 2,
        attempt: 1,
        budgetMs: 4000,
      };
      const next = controlFlowNesting(context);
      return {
        ...state,
        diagnostics: [...state.diagnostics, ...next.path],
        logs: [...state.logs, `advance:${next.accepted}-${next.rejected}`],
        status: next.accepted > next.rejected ? 'active' : 'stopped',
      };
    }
    case 'select': {
      const parsed = parseRoute(action.route);
      return {
        ...state,
        logs: [...state.logs, `select:${parsed.key}`],
      };
    }
    case 'metrics': {
      const score = Math.max(0, 100 - action.metrics.latencyMs);
      return {
        ...state,
        priorityScore: score,
        logs: [...state.logs, `metrics:${action.route}:${action.metrics.latencyMs}`],
      };
    }
    case 'error':
      return {
        ...state,
        status: 'stopped',
        lastError: action.message,
        logs: [...state.logs, `error:${action.message}`],
      };
    case 'clear':
      return {
        ...state,
        diagnostics: [],
        logs: ['reset'],
        priorityScore: 0,
        status: 'idle',
      };
    default:
      return state;
  }
};

export const useTscStressLabWorkspace = (tenant: string, mode: TscMode = 'run') => {
  const seed = buildWorkspaceState(tenant, 'recovery');
  const [state, dispatch] = useReducer(reducer, seed, (initial) => initialState(initial.tenant, mode));

  const tenantRef = useRef(tenant);
  const versionRef = useRef(0);

  useEffect(() => {
    if (tenantRef.current !== tenant) {
      tenantRef.current = tenant;
      versionRef.current += 1;
      dispatch({ type: 'bootstrap', tenant, mode });
    }
  }, [tenant, mode]);

  const bootstrap = useCallback(() => {
    dispatch({ type: 'bootstrap', tenant, mode });
  }, [tenant, mode]);

  const runPhase = useCallback(
    async (phase: GraphPhase) => {
      dispatch({
        type: 'activate',
        phase,
        route: state.routes[versionRef.current % state.routes.length] ?? state.routes[0],
      });
    },
    [state.routes],
  );

  const selectRoute = useCallback((route: OrchestratorRoute, event: TscWorkspaceActionUnion) => {
    dispatch({ type: 'select', route });
    if (event.type === 'run') {
      void runPhase('phase_03_discover');
    }
    if (event.type === 'abort') {
      dispatch({ type: 'error', message: `abort:${event.reason}` });
    }
  }, [runPhase]);

  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const tick = useCallback(async () => {
    const nested = controlFlowNesting({ tenant, zone: 'zone-a', severity: 2, attempt: versionRef.current + 1, budgetMs: 1200 });
    dispatch({ type: 'advance', override: true, event: nested as unknown as BranchContext });
    const route = state.routes[versionRef.current % state.routes.length] ?? state.routes[0];
    dispatch({ type: 'metrics', route, metrics: { latencyMs: nested.accepted } });
  }, [tenant, state.routes]);

  const summary = useMemo(
    () => ({
      active: state.status === 'active' ? state.diagnostics.length : 0,
      errors: state.diagnostics.filter((entry) => !entry.accepted).length,
      score: state.priorityScore,
    }),
    [state.status, state.diagnostics, state.priorityScore],
  );

  const runAll = useCallback(async () => {
    const phases = Object.keys(runGraph(tenant, 'zone-a')) as GraphPhase[];
    for (const phase of phases) {
      await runPhase(phase);
    }
    await tick();
    return summary;
  }, [tenant, runPhase, tick, summary]);

  return {
    state,
    bootstrap,
    runPhase,
    selectRoute,
    clear,
    tick,
    runAll,
    summary,
    version: versionRef.current,
    domain: seed.domain,
    mode,
    modePayload: { mode, attempts: summary.errors + 1 },
    actions: {
      bootstrap: () => dispatch({ type: 'bootstrap', tenant, mode }),
      clear: () => dispatch({ type: 'clear' }),
      pause: () => dispatch({ type: 'error', message: 'pause not implemented' }),
      resume: () => dispatch({ type: 'bootstrap', tenant, mode }),
      stop: () => dispatch({ type: 'error', message: 'stop requested' }),
    },
  };
};

export const routeDispatcher = (
  route: OrchestratorRoute,
  action: TscWorkspaceActionUnion,
): { route: OrchestratorRoute; action: TscWorkspaceActionUnion } => ({ route, action });
