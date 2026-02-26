import { useCallback, useMemo, useState } from 'react';
import { compileRouteCatalog, evaluateRoutes, runDispatchChain, routeBranchDiagnostics } from '@domain/recovery-lab-synthetic-orchestration';
import type {
  BranchRoutes,
  BranchInput,
  BranchOutput,
  BranchSolver,
} from '@domain/recovery-lab-synthetic-orchestration/compiler-branching-lattice';
import {
  stressUnion,
  type RoutedTuple,
  type SolverInputMatrix,
} from '@domain/recovery-lab-synthetic-orchestration/compiler-advanced-stress-lab';

type BenchMode = 'fast' | 'thorough';

type BenchState = {
  readonly mode: BenchMode;
  readonly routes: readonly BranchRoutes[];
  readonly diagnostics: string[];
  readonly score: number;
  readonly dispatches: ReadonlyArray<{
    event: string;
    outcome: string;
  }>;
};

const defaultRoutes = [
  'incident.discover.critical',
  'incident.assess.low',
  'workflow.restore.low',
  'risk.triage.high',
  'mesh.route.low',
  'policy.audit.medium',
] as const satisfies readonly BranchRoutes[];

export const useTypeLevelStressBench = () => {
  const [mode, setMode] = useState<BenchMode>('fast');
  const [routes, setRoutes] = useState<readonly BranchRoutes[]>(defaultRoutes);
  const [seed, setSeed] = useState<string>('incident');

  const diagnostics = useMemo(() => {
    const merged = compileRouteCatalog(routes);
    const counts = merged.constraints.map((constraint) => {
      const tupleEnvelope = constraint.tuple as unknown as {
        readonly envelope?: {
          readonly createdAt?: string;
          readonly [key: string]: unknown;
        };
      };
      const createdAt = tupleEnvelope.envelope?.createdAt ?? 'n/a';
      const traceLength = Array.isArray((constraint.tuple as { readonly trace?: readonly string[] }).trace)
        ? (constraint.tuple as { readonly trace: readonly string[] }).trace.length
        : 0;
      const raw = `${constraint.route}:${createdAt}:${traceLength}`;
      return raw;
    });
    return counts.toSorted((left, right) => left.localeCompare(right)).slice(0, 50);
  }, [routes]);

  const dispatches = useMemo(() => {
    const firstRoute = routes[0];
    if (!firstRoute) return [];
    const route = evaluateRoutes(firstRoute);
    return route.branches;
  }, [routes]);

  const profile = useMemo(() => routeBranchDiagnostics().diagnostics, []);

  const routed = useMemo(
    () => stressUnion.slice(0, Math.max(4, routes.length)),
    [routes.length],
  ) as unknown as RoutedTuple[];

  const score = useMemo(() => {
    const routeScore = routes.reduce((total, route) => total + route.length, 0);
    const dispatchScore = dispatches.reduce((total, entry) => total + entry.event.length, 0);
    const diagnosticScore = diagnostics.reduce((total, entry) => total + entry.length, 0);
    return routeScore + dispatchScore + diagnosticScore;
  }, [routes, dispatches, diagnostics]);

  const bundles = useMemo(() => {
    const mapped = diagnostics
      .toSorted((left, right) => right.length - left.length)
      .map((entry, index) => {
        return {
          index,
          entry,
          route: routes[index] ?? routes[0] ?? 'incident.discover.critical',
          seed,
          active: index < routes.length,
          solver: routes[index] ?? routes[0],
        };
      });
    return mapped;
  }, [diagnostics, routes, seed]);

  const run = useCallback(async () => {
    const rows = new AsyncDisposableStack();
    const primaryRoute = routes[0] ?? 'incident.discover.critical';
    const relation = {
      [`left:${primaryRoute}`]: `right:${primaryRoute}`,
    } as Record<`left:${string}`, `right:${string}`>;
    const bundles = routes.reduce<Record<string, { route: BranchRoutes; raw: string }>>((acc, route, index) => {
      acc[`route:${index}`] = {
        route,
        raw: `slot-${index}:${route}`,
      };
      return acc;
    }, {});
    const typedBundles = bundles as SolverInputMatrix<readonly BranchRoutes[]>['bundles'];
    const solverInput: SolverInputMatrix<BranchRoutes[]> = {
      bundles: typedBundles,
      solver: {
        left: `left:${primaryRoute}`,
        right: `right:${primaryRoute}`,
        relation,
        accepted: ['attempt'],
      } as unknown as SolverInputMatrix<readonly BranchRoutes[]>['solver'],
    };
    if (mode === 'thorough') {
      for (const batch of Object.values(solverInput.bundles)) {
        await Promise.resolve(batch);
      }
    }
    rows.defer(async () => {
      await Promise.resolve(
        {
          count: Object.keys(solverInput.bundles).length,
          mode,
          score,
        },
      );
    });
    await rows.disposeAsync();
  }, [mode, routes, score]);

  const updateMode = useCallback((next: BenchMode) => setMode(next), []);
  const appendRoute = useCallback((route: BranchRoutes) => setRoutes((current) => [...current, route].slice(-24)), []);
  const removeRoute = useCallback((route: BranchRoutes) => setRoutes((current) => current.filter((entry) => entry !== route)), []);
  const clearRoutes = useCallback(() => setRoutes(defaultRoutes), []);
  const changeSeed = useCallback((next: string) => setSeed(next), []);

  const syntheticDisposer = useCallback(() => {
    const map = new Map<string, BranchSolver<BranchInput, BranchOutput>>();
    for (const route of routes) {
      map.set(route, {
        input: `${seed}:${route}` as BranchInput,
        output: `${route.toUpperCase()}:${mode}` as BranchOutput,
        score: route.length,
      });
    }
    return map;
  }, [mode, routes, seed]);

  const trace = useCallback(() => {
    const all = routes.flatMap((route) => runDispatchChain({ route, attempt: route.length }));
    return all.map((entry, index) => `${index}:${entry.event}:${entry.outcome}`);
  }, [routes]);

  const solverRun = useCallback(() => {
    const result = solveSuite({
      mode,
      routes,
      seed,
      score,
    });
    return result;
  }, [mode, routes, seed, score]);

  return {
    state: { mode, routes, diagnostics, score, dispatches },
    profile,
    routed,
    bundles,
    trace,
    mapped: syntheticDisposer(),
    run,
    updateMode,
    appendRoute,
    removeRoute,
    clearRoutes,
    changeSeed,
    solverRun,
  } as const;
};

const solveSuite = (input: { mode: BenchMode; routes: readonly BranchRoutes[]; seed: string; score: number }) => {
  const iterations = input.routes.length * (input.mode === 'thorough' ? 4 : 2);
  const checkpoints = Array.from({ length: iterations }).reduce<string[]>((acc, _, index) => {
    const route = input.routes[index % input.routes.length];
    acc.push(`${input.seed}:${route}:${index}`);
    return acc;
  }, []);
  return {
    seed: input.seed,
    mode: input.mode,
    count: checkpoints.length,
    checksum: checkpoints.join('|').length + input.score,
  };
};
