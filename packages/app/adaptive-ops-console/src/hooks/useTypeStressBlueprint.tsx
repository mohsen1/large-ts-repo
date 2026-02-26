import { useMemo, useState } from 'react';
import {
  compileStressHub,
  stressHubFactory,
  type StressHubBlueprintRegistry,
} from '@shared/type-level-hub/src/type-level-stress-constructor';
import { branchUnion, buildBranchTrace } from '@shared/type-level/stress-controlflow-switchyard';
import { evaluateLogicalChain, type SmallNumber } from '@shared/type-level/stress-binary-expression-arena';

export type NoInfer<T> = [T][T extends any ? 0 : never];

type BlueprintSeed = {
  readonly tenant: string;
  readonly region: string;
  readonly scope: 'global' | 'regional' | 'local';
};

const initialSeed = {
  tenant: 'ops-alpha',
  region: 'us-east',
  scope: 'global',
} satisfies NoInfer<BlueprintSeed>;

const preloadedHub = stressHubFactory(initialSeed);

const preloadedTrace = buildBranchTrace();

export const useTypeStressBlueprint = (seedOverride?: NoInfer<BlueprintSeed>) => {
  const [seed, setSeed] = useState<BlueprintSeed>(seedOverride ?? initialSeed);
  const [manual, setManual] = useState(true);
  const buildRegistry = (input: BlueprintSeed): StressHubBlueprintRegistry => {
    const built = compileStressHub(input);
    return built.registry;
  };

  const registry = useMemo(() => buildRegistry(seed), [seed]);

  const computedScore = useMemo(() => {
    const left = seed.tenant.length % 10;
    const right = seed.region.length % 10;
    return evaluateLogicalChain({
      fast: left > 2,
      secure: right > 2,
      stable: manual,
      remote: true,
      active: left % 2 === 0,
      count: (left + 3) as SmallNumber,
      priority: (right + 1) as SmallNumber,
    });
  }, [seed, manual]);

  const branchMap = useMemo(
    () =>
      branchUnion.reduce<Record<string, number>>((acc, code) => {
        const entry = preloadedTrace.find((item) => item.code === code);
        acc[code] = entry ? Number(entry.decision.decision.accepted) : 0;
        return acc;
      }, {}),
    [seed],
  );

  const snapshot = useMemo<{
    registry: StressHubBlueprintRegistry;
    traces: ReturnType<typeof buildBranchTrace>;
    score: ReturnType<typeof evaluateLogicalChain>;
  }>(() => {
    if (manual) {
      return {
        registry,
        traces: preloadedTrace,
        score: computedScore,
      };
    }

    return {
      registry,
      traces: buildBranchTrace(),
      score: computedScore,
    };
  }, [registry, manual, computedScore]);

  const totalBranches = preloadedTrace.length;
  const activeBranches = preloadedTrace.filter((entry) => entry.decision.decision.accepted).length;

  return {
    seed,
    registry,
    snapshot,
    branchMap,
    totalBranches,
    activeBranches,
    preloadedHub,
    manual,
    setManual: (value: boolean) => setManual(value),
    setSeed: (value: BlueprintSeed) => setSeed(value),
    setTenant: (tenant: string) => setSeed((current) => ({ ...current, tenant })),
    setRegion: (region: string) => setSeed((current) => ({ ...current, region })),
  };
};

export const useTypeStressBlueprintMetrics = (seed: NoInfer<BlueprintSeed>) => {
  const [metrics] = useState(() => {
    const base = stressHubFactory(seed);
    return {
      macroCount: base.registry.macros.length,
      branchCount: base.registry.branchMatrix.length,
      routeCount: Object.keys(base.registry.catalogs).length,
      hasDecisions: base.decisions.length > 0,
    };
  });

  return metrics;
};

export const useBlueprintRuntime = (seed: NoInfer<BlueprintSeed>) => {
  return useMemo(() => {
    const built = compileStressHub(seed);
    return {
      buildLayerCount: built.layers.length,
      layerKeys: built.layers.map((layer) => layer.vertexId),
      registryMacros: built.registry.macros,
      branchTraceLength: built.decisions.length,
      constructor: built,
    } as const;
  }, [seed]);
};
