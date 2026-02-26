import { useCallback, useMemo, useState } from 'react';
import {
  routeTemplates,
  isRecoveryRouteTemplate,
  runStressDiagnostics,
  createConstraintGraph,
  type ConstraintGraph,
  type RecoveryRouteTemplate,
  parseRouteLine,
  transitionByToken,
  hydrateBlueprint,
  type StreamRouteBlueprint,
  type StressAdapterEvent,
  type StressSessionState,
} from '../services/recoveryStressAdapter';
import { type SolverVerb } from '@shared/type-level-composition';

export interface StressWorkbenchInput {
  readonly tenant: string;
  readonly initialState: StressSessionState;
}

export interface StressWorkbenchState {
  readonly state: StressSessionState;
  readonly routeCount: number;
  readonly activeRoute: RecoveryRouteTemplate | undefined;
  readonly diagnostics: readonly StressAdapterEvent[];
  readonly canStep: boolean;
  readonly blueprint: StreamRouteBlueprint<typeof routeTemplates>;
  readonly graph: ConstraintGraph<readonly [
    'validate',
    'infer',
    'resolve',
    'merge',
    'accumulate',
    'dispatch',
    'throttle',
    'enforce',
    'report',
    'replay',
  ]>;
}

const allVerbs = ['validate', 'infer', 'resolve', 'merge', 'accumulate', 'dispatch', 'throttle', 'enforce', 'report', 'replay'] as const satisfies readonly SolverVerb[];

const phaseCatalog: Record<(typeof allVerbs)[number], TracePhaseEntry> = {
  validate: {
    kind: 'validate',
    input: { solver: 'scalar', phase: 'draft', retries: 4, limit: 128, required: true },
    output: { ok: true },
  },
  infer: {
    kind: 'infer',
    input: { solver: 'scalar', phase: 'draft', retries: 4, limit: 128, required: false },
    output: { inference: true },
  },
  resolve: {
    kind: 'resolve',
    input: { solver: 'scalar', phase: 'apply', retries: 4, limit: 128, required: true },
    output: { resolved: true },
  },
  merge: {
    kind: 'merge',
    input: { solver: 'scalar', phase: 'commit', retries: 4, limit: 128, required: true },
    output: { merged: true },
  },
  accumulate: {
    kind: 'accumulate',
    input: { solver: 'scalar', phase: 'draft', retries: 4, limit: 128, required: false },
    output: { accumulated: true },
  },
  dispatch: {
    kind: 'dispatch',
    input: { solver: 'scalar', phase: 'commit', retries: 4, limit: 128, required: true },
    output: { dispatched: true },
  },
  throttle: {
    kind: 'throttle',
    input: { solver: 'scalar', phase: 'apply', retries: 4, limit: 128, required: false },
    output: { throttled: true },
  },
  enforce: {
    kind: 'enforce',
    input: { solver: 'scalar', phase: 'apply', retries: 4, limit: 128, required: true },
    output: { enforced: true },
  },
  report: {
    kind: 'report',
    input: { solver: 'scalar', phase: 'apply', retries: 4, limit: 128, required: false },
    output: { reported: true },
  },
  replay: {
    kind: 'replay',
    input: { solver: 'scalar', phase: 'apply', retries: 4, limit: 128, required: true },
    output: { replayed: true },
  },
} as const;

type TracePhaseEntry = {
  readonly kind: SolverVerb;
  readonly input: {
    readonly solver: 'scalar';
    readonly phase: 'draft' | 'commit' | 'apply';
    readonly retries: 4;
    readonly limit: 128;
    readonly required: boolean;
  };
  readonly output: Record<string, true>;
};


const evaluateRoute = (route: string): StressSessionState => {
  const [, action] = route.split('/').filter(Boolean);
  return transitionByToken(action);
};

const branchMap = {
  fleet: { selected: true, surface: 'fleet' as const },
  fabric: { selected: true, surface: 'fabric' as const },
  chronicle: { selected: true, surface: 'chronicle' as const },
  continuity: { selected: false, surface: 'fleet' as const },
  incident: { selected: true, surface: 'fabric' as const },
} as const;

const toEvent = (at: number, kind: StressAdapterEvent['kind'], text: string): StressAdapterEvent => ({
  at,
  kind,
  text,
});

export const useRecoveryStressWorkbench = ({ tenant, initialState }: StressWorkbenchInput): StressWorkbenchState & {
  step: (index: number) => void;
  selectTemplate: (template: string) => void;
  run: () => Promise<void>;
} => {
  const [state, setState] = useState<StressSessionState>(initialState);
  const [diagnostics, setDiagnostics] = useState<readonly StressAdapterEvent[]>([]);
  const [activeRoute, setActiveRoute] = useState<RecoveryRouteTemplate | undefined>(undefined);

  const blueprint = useMemo<StreamRouteBlueprint<typeof routeTemplates>>(() => hydrateBlueprint(routeTemplates), []);
  const graph = useMemo(() => createConstraintGraph(), []);

  const step = useCallback((index: number) => {
    const route = routeTemplates[index];
    if (!route) {
      setState('closing');
      return;
    }

    const next = evaluateRoute(route);
    if (route.length < 10) {
      setState('idle');
    } else if (route.includes('recovery') || route.includes('fabric')) {
      setState('dispatching');
    } else if (route.includes('chronicle')) {
      setState('resolving');
    } else if (route.includes('telemetry')) {
      setState('collecting');
    } else {
      setState(next);
    }

    const selected = branchMap[route.split('/')[1] as keyof typeof branchMap];
    if (selected?.selected) {
      setDiagnostics((current) => [
        ...current,
        toEvent(
          Date.now() + index,
          next === 'resolving' ? 'resolved' : next === 'dispatching' ? 'dispatched' : 'enqueued',
          `${tenant}:${route}:${selected.surface}`,
        ),
      ]);
    }

    setActiveRoute(isRecoveryRouteTemplate(route) ? route : undefined);
  }, [tenant]);

  const selectTemplate = useCallback((template: string) => {
    const mapped = routeTemplates.find((candidate) => candidate === template);
    if (!mapped) {
      setDiagnostics((current) => [
        ...current,
        toEvent(Date.now(), 'error', `unknown template ${template}`),
      ]);
      return;
    }
    setActiveRoute(isRecoveryRouteTemplate(mapped) ? mapped : undefined);
    setState('collecting');
  }, []);

  const run = useCallback(async () => {
    setState('collecting');
    for (let i = 0; i < routeTemplates.length; i += 1) {
      const phase = allVerbs[i % allVerbs.length];
      const record = phaseCatalog[phase];
      const kind: StressAdapterEvent['kind'] =
        phase === 'validate' ? 'enqueued' : phase === 'infer' ? 'resolved' : 'dispatched';
      const trace = {
        at: i + 1,
        kind,
        text: `phase=${phase} kind=${record.kind}`,
      };
      setDiagnostics((current) => [...current, toEvent(trace.at, trace.kind, trace.text)]);
      step(i);
    }
    setState('closing');

    const result = await runStressDiagnostics();
    if (result.state === 'collecting' || result.state === 'closing') {
      setDiagnostics((current) => [...current, ...result.diagnostics]);
    }
  }, [step]);

  return {
    state,
    routeCount: routeTemplates.length,
    activeRoute,
    diagnostics,
    canStep: state !== 'closing',
    graph,
    step,
    selectTemplate,
    run,
    blueprint,
  };
};
