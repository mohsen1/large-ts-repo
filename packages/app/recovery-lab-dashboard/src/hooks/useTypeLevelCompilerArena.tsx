import { useCallback, useMemo, useState } from 'react';
import {
  routeResolution,
  routeCatalog as cascadeCatalog,
  resolveRoutesInCascade,
  type CascadeRoute,
  type DistilledCatalog,
} from '@shared/type-level/stress-template-route-cascade';
import { evaluateFlowGraph, type BranchEvent, type BranchResult } from '@shared/type-level/stress-controlflow-branch-arena';
import { resolveCatalog, type DiscriminatedRouteResolution, type StressRouteToken, routeCatalog as tokenCatalog } from '@shared/type-level/stress-conditional-discriminator-lattice';
import {
  createSolverInvocationMatrix,
  makeHigherOrderSolver,
  solverMatrixSummary,
  type SolverMode,
  type SolverScope,
  type SolverVerb,
  withBrand,
} from '@shared/type-level/stress-generic-instantiation-matrix';

type ArenaScope = 'all' | 'ops' | 'incident' | 'fabric' | 'policy';
type ArenaPage = 'routes' | 'branches' | 'solvers';

type SolverSummary = ReturnType<typeof solverMatrixSummary>;

interface UseTypeLevelCompilerArenaOptions {
  readonly initialScope: ArenaScope;
  readonly initialPage: ArenaPage;
}

interface UseTypeLevelCompilerArenaState {
  readonly scope: ArenaScope;
  readonly page: ArenaPage;
  readonly loading: boolean;
  readonly selectedRoutes: readonly CascadeRoute[];
  readonly routeResolutions: DistilledCatalog<readonly CascadeRoute[]>;
  readonly routeByToken: readonly DiscriminatedRouteResolution<StressRouteToken>[];
  readonly branchLog: readonly BranchResult<BranchEvent>[];
  readonly branchState: 'idle' | 'running' | 'complete';
  readonly solverSummary: SolverSummary;
  readonly matrixSize: number;
  readonly taggedSample: ReturnType<typeof withBrand> | null;
  readonly routeCascade: ReturnType<typeof resolveRoutesInCascade>;
  readonly actions: {
    setScope: (next: ArenaScope) => void;
    setPage: (next: ArenaPage) => void;
    runRouteResolution: () => Promise<void>;
    runBranchPass: () => Promise<void>;
    runSolverPass: () => Promise<void>;
    resetAll: () => void;
  };
}

const branchEvents: readonly BranchEvent[] = [
  {
    kind: 'boot',
    source: 'recovery',
    tenant: 'tenant-ops',
    index: 0,
    mode: 'strict',
    canary: true,
  },
  {
    kind: 'scan',
    source: 'fabric',
    tenant: 'tenant-fabric',
    index: 1,
    mode: 'diagnostic',
    items: ['nodes', 'edges'],
  },
  {
    kind: 'classify',
    source: 'incident',
    tenant: 'tenant-incident',
    index: 2,
    mode: 'strict',
    confidence: 0.93,
  },
  {
    kind: 'assess',
    source: 'policy',
    tenant: 'tenant-policy',
    index: 3,
    mode: 'diagnostic',
    score: 0.74,
  },
  {
    kind: 'notify',
    source: 'ops',
    tenant: 'tenant-ops',
    index: 4,
    mode: 'sim',
    channels: ['webhook', 'email'],
  },
  {
    kind: 'degrade',
    source: 'ops',
    tenant: 'tenant-ops',
    index: 5,
    mode: 'strict',
    degradeLevel: 4,
  },
  {
    kind: 'route',
    source: 'ops',
    tenant: 'tenant-ops',
    index: 6,
    mode: 'lax',
    target: 'mesh/route/high/tenant/1234',
  },
  {
    kind: 'complete',
    source: 'ops',
    tenant: 'tenant-ops',
    index: 7,
    mode: 'strict',
    exitCode: 0,
  },
] as const;

const routeCatalogSnapshot = [...cascadeCatalog, 'incident/replay/low/session/1999' as CascadeRoute] as const satisfies readonly CascadeRoute[];

const buildSolverInput = (mode: SolverMode, scope: SolverScope, verb: SolverVerb) => ({
  mode,
  scope,
  payload: `${mode}:${scope}:${verb}`,
  tags: ['arena', verb],
});

const resolveByScope = (scope: ArenaScope, routes: readonly CascadeRoute[]) => {
  if (scope === 'all') {
    return routes;
  }
  return routes.filter((route) => route.startsWith(scope));
};

export const useTypeLevelCompilerArena = ({ initialScope, initialPage }: UseTypeLevelCompilerArenaOptions): UseTypeLevelCompilerArenaState => {
  const [scope, setScope] = useState<ArenaScope>(initialScope);
  const [page, setPage] = useState<ArenaPage>(initialPage);
  const [loading, setLoading] = useState(false);
  const [routeResolutions, setRouteResolutions] = useState<DistilledCatalog<readonly CascadeRoute[]>>([] as unknown as DistilledCatalog<readonly CascadeRoute[]>);
  const [routeByToken, setRouteByToken] = useState<readonly DiscriminatedRouteResolution<StressRouteToken>[]>([]);
  const [branchLog, setBranchLog] = useState<readonly BranchResult<BranchEvent>[]>([]);
  const [branchState, setBranchState] = useState<'idle' | 'running' | 'complete'>('idle');
  const [solverSummary, setSolverSummary] = useState<SolverSummary>(() =>
    solverMatrixSummary(createSolverInvocationMatrix(['strict', 'adaptive'], ['tenant', 'mesh'], ['read', 'route'])),
  );
  const [taggedSample, setTaggedSample] = useState<ReturnType<typeof withBrand> | null>(null);

  const selectedRoutes = useMemo(
    () => resolveByScope(scope, routeCatalogSnapshot).slice(0, 8),
    [scope],
  );
  const routeCascade = useMemo(() => resolveRoutesInCascade([...routeCatalogSnapshot]), [routeCatalogSnapshot]);

  const routeCatalogForTokens = useMemo(() => [...tokenCatalog, 'ops/replay/warmup/domain'], []);
  const routeFactory = useMemo(() => makeHigherOrderSolver('solver:bootstrap'), []);

  const runRouteResolution = useCallback(async () => {
    setLoading(true);
    try {
      const raw = resolveCatalog(routeCatalogForTokens as readonly StressRouteToken[]);
      setRouteByToken(raw);
      setRouteResolutions(routeResolution(selectedRoutes));
      const probe = routeFactory(
        buildSolverInput('strict', 'tenant', 'read'),
        'read',
        (result, meta, input, verb, trace) => {
          if (trace.length < 1 || meta.token.length < 1 || result.trace.length < 1 || input.payload.length < 1 || verb !== 'read') {
            throw new Error('solver baseline mismatch');
          }
          return result;
        },
      );
      setTaggedSample(withBrand(probe));
    } finally {
      setLoading(false);
    }
  }, [selectedRoutes, routeCatalogForTokens]);

  const runBranchPass = useCallback(async () => {
    setBranchState('running');
    const output = evaluateFlowGraph(branchEvents);
    setBranchLog(output);
    setBranchState('complete');
  }, []);

  const runSolverPass = useCallback(async () => {
    setLoading(true);
    const matrix = createSolverInvocationMatrix(
      ['strict', 'adaptive', 'diagnostic'],
      ['tenant', 'cluster', 'service', 'mesh'],
      ['read', 'write', 'drain', 'route', 'eject'],
    );
    const summary = solverMatrixSummary(matrix);
    const sample = matrix.invocations[0]?.result;
    setSolverSummary(summary);
    setTaggedSample(sample ? withBrand(sample) : null);
    setLoading(false);
  }, []);

  const resetAll = useCallback(() => {
    setRouteResolutions([] as unknown as DistilledCatalog<readonly CascadeRoute[]>);
    setRouteByToken([]);
    setBranchLog([]);
    setBranchState('idle');
    setSolverSummary({
      total: 0,
      uniqueModes: [],
      uniqueScopes: [],
      sample: undefined,
    });
    setTaggedSample(null);
  }, []);

  const solverSummaryPreview = useMemo(
    () => ({
      total: solverSummary.total,
      uniqueModes: solverSummary.uniqueModes,
      uniqueScopes: solverSummary.uniqueScopes,
      sample: solverSummary.sample as SolverSummary['sample'],
    }),
    [solverSummary],
  );

  return {
    scope,
    page,
    loading,
    selectedRoutes,
    routeResolutions,
    routeByToken,
    branchLog,
    branchState,
    solverSummary: solverSummaryPreview,
    matrixSize: solverSummary.total,
    taggedSample,
    routeCascade,
    actions: {
      setScope: (next) => setScope(next),
      setPage: (next) => setPage(next),
      runRouteResolution,
      runBranchPass,
      runSolverPass,
      resetAll,
    },
  };
};
