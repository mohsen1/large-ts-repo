import { useEffect, useMemo, useState } from 'react';
import {
  buildSolverCatalog,
  runSolverBenchmark,
  solve,
  type SolverBenchmarkEntry,
  type SolverMode,
  type SolverRunRecord,
  type SolverResult,
  type SolverBrand,
} from '@shared/type-level/stress-generic-solver-orchestrator';
import { executeSagaSummary, executeSagaWorkflow, type SagaInput, type SagaSignal } from '@shared/type-level/stress-controlflow-saga-graph';
import { evaluateLogicalOrbit } from '@shared/type-level/stress-binary-expression-orbit';
import { buildClassLeaf, type DeepSpanChain } from '@shared/type-level/stress-deep-hierarchy-radar';
import { compileStressHub, type StressHubBlueprintRegistry } from '@shared/type-level-hub/src/type-level-stress-constructor';
import { parseSpokeRoute, spokeRouteCatalog, type SpokeRoute } from '@shared/type-level/stress-conditional-spoke-lattice';

type SolverSnapshot = {
  readonly total: number;
  readonly completed: number;
  readonly records: readonly SolverRunRecord[];
};

type SagaSnapshot = {
  readonly completed: boolean;
  readonly total: number;
  readonly resolved: number;
};

type SolverStressState = {
  readonly solverRecords: readonly SolverBenchmarkEntry<SolverMode, string>[];
  readonly solverCatalog: ReadonlyArray<ReturnType<typeof buildSolverCatalog>[number]>;
  readonly solverSnapshot: SolverSnapshot;
  readonly sagaSnapshot: SagaSnapshot;
  readonly spokeCount: number;
  readonly chainDepth: number;
  readonly hubRegistry: StressHubBlueprintRegistry;
  readonly orbitScore: number;
};

type UseTypeSolverStressLabResult = {
  readonly seed: SeveritySeed;
  readonly setSeed: (seed: SeveritySeed) => void;
  readonly snapshots: SolverStressState;
  readonly isBusy: boolean;
  readonly error: string;
  readonly solverResult: SolverResult<unknown> | null;
  readonly chain: ReturnType<typeof buildClassLeaf>;
  readonly deepChain: DeepSpanChain;
  readonly sampleRoutes: string[];
  readonly routeProfiles: Record<string, ReturnType<typeof parseSpokeRoute>>;
  readonly executeSignals: () => readonly SolverBenchmarkEntry<SolverMode, string>[];
  readonly supportedPhases: SagaSignal[];
};

type SeveritySeed = {
  readonly tenant: string;
  readonly score: number;
};

const initialSeed: SeveritySeed = {
  tenant: 'ops-stress',
  score: 88,
};

const buildSagaSnapshot = (seed: SeveritySeed): SagaSnapshot => {
  const input: SagaInput = {
    tenant: seed.tenant,
    score: seed.score,
  };
  const sagaTrace = executeSagaWorkflow(input);
  const summary = executeSagaSummary(input);
  return {
    completed: summary.completed,
    total: sagaTrace.length,
    resolved: summary.resolved,
  };
};

const buildSolverSnapshot = (seed: SeveritySeed): SolverSnapshot => {
  const base = runSolverBenchmark();
  const catalog = buildSolverCatalog(seed.tenant, 'strict', ['analyze', 'resolve', 'verify'], {
    strict: true,
    level: Math.min(5, Math.max(1, Math.floor(seed.score / 20))),
  });
  return {
    total: base.length,
    completed: base.reduce((acc, item) => acc + Number(item.output.value > 0), 0),
    records: catalog as readonly SolverRunRecord[],
  };
};

const toSolverResult = async (seed: SeveritySeed): Promise<{
  readonly result: SolverResult<unknown>;
  readonly orbit: number;
}> => {
  const result = await new Promise<SolverResult<unknown>>((resolve) => {
    resolve(
      solve(
        { verb: 'analyze', mode: 'strict', payload: { strict: true, level: seed.score } },
        {
          domain: seed.tenant,
          tenant: seed.tenant,
      contract: { verb: 'analyze', mode: 'strict', payload: { strict: true, level: seed.score } },
      constraints: {
            domain: `${seed.tenant}-domain` as SolverBrand<string>,
            mode: 'strict',
            verbs: ['analyze', 'resolve', 'verify'],
            scope: 'default',
          },
        },
      ) as SolverResult<unknown>,
    );
  });
  return {
    result,
    orbit: evaluateLogicalOrbit({
      fast: seed.score > 30,
      secure: seed.score > 20,
      stable: seed.score > 50,
      remote: seed.score < 95,
      active: true,
      count: (seed.score % 10) as 0,
      priority: 8,
    }),
  };
};

export const useTypeSolverStressLab = (seedOverride?: SeveritySeed): UseTypeSolverStressLabResult => {
  const [seed, setSeed] = useState<SeveritySeed>(seedOverride ?? initialSeed);
  const [solverResult, setSolverResult] = useState<SolverResult<unknown> | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>('');

  const chain = useMemo(() => buildClassLeaf(), []);
  const chainDepth = Object.keys(chain).length;
  const deepChain = useMemo<DeepSpanChain>(() => ({
    anchor: true,
    stageOne: 1,
    stageTwo: 2,
    stageThree: 3,
    stageFour: 4,
    stageFive: 5,
    stageSix: 6,
    stageSeven: 7,
    stageEight: 8,
    stageNine: 9,
    stageTen: 10,
    stageEleven: 11,
    stageTwelve: 12,
    stageThirteen: 13,
    stageFourteen: 14,
    stageFifteen: 15,
    stageSixteen: 16,
    stageSeventeen: 17,
    stageEighteen: 18,
    stageNineteen: 19,
    stageTwenty: 20,
    stageTwentyOne: 21,
    stageTwentyTwo: 22,
    stageTwentyThree: 23,
    stageTwentyFour: 24,
    stageTwentyFive: 25,
    stageTwentySix: 26,
    stageTwentySeven: 27,
    stageTwentyEight: 28,
    stageTwentyNine: 29,
    stageThirty: 30,
    stageThirtyOne: 31,
    stageThirtyTwo: 32,
    stageThirtyThree: 33,
    stageThirtyFour: 34,
    stageThirtyFive: 35,
    stageThirtySix: 36,
    stageThirtySeven: 37,
    stageThirtyEight: 38,
    stageThirtyNine: 39,
    stageForty: 40,
  }), []);

  const snapshots = useMemo<SolverStressState>(() => {
    const solverSnapshot = buildSolverSnapshot(seed);
    const sagaSnapshot = buildSagaSnapshot(seed);
    const solverCatalog = buildSolverCatalog(seed.tenant, 'strict', ['analyze', 'resolve', 'verify'], {
      strict: true,
      level: Math.max(1, Math.min(5, seed.score)),
    });
    return {
      solverRecords: runSolverBenchmark(),
      solverCatalog: solverCatalog as ReadonlyArray<ReturnType<typeof buildSolverCatalog>[number]>,
      solverSnapshot,
      sagaSnapshot,
      spokeCount: spokeRouteCatalog.length,
      chainDepth,
      hubRegistry: compileStressHub(seed).registry,
      orbitScore: seed.score * 2,
    } as SolverStressState;
  }, [chainDepth, seed]);

  useEffect(() => {
    let active = true;
    using _scope = {
      [Symbol.dispose]: () => {
        active = false;
      },
    };
    setIsBusy(true);
    setError('');
    toSolverResult(seed)
      .then((resolved) => {
        if (active) {
          setSolverResult(resolved.result);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Unhandled solver failure');
        }
      })
      .finally(() => {
        if (active) {
          setIsBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [seed.score, seed.tenant]);

  const sampleRoutes = executeSagaWorkflow({
    tenant: seed.tenant,
    score: seed.score,
  }).map((entry) => entry.detail);

  const routeProfiles = useMemo<Record<string, ReturnType<typeof parseSpokeRoute>>>(
    () =>
      spokeRouteCatalog.slice(0, 18).reduce<Record<string, ReturnType<typeof parseSpokeRoute>>>(
        (acc, route) => {
          const parsed = parseSpokeRoute(route as SpokeRoute);
          if (parsed) {
            acc[route] = parsed;
          }
          return acc;
        },
        {},
      ),
    [],
  );

  return {
    seed,
    setSeed,
    snapshots,
    isBusy,
    error,
    solverResult,
    chain,
    deepChain,
    sampleRoutes,
    routeProfiles,
    executeSignals: () => snapshots.solverRecords.slice(0, 3),
    supportedPhases: [
      'phase-01' as SagaSignal,
      'phase-32' as SagaSignal,
      'phase-64' as SagaSignal,
    ],
  } as const;
};
