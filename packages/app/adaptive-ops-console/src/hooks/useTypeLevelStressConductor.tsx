import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCatalogFromSpec,
  buildRecursiveRouteSet,
  buildRouteTree,
  mapRoutePayload,
  normalizeRouteBatch,
  parseRouteToken,
  resolveRouteToken,
  routeBlueprintCatalog,
  routePairs,
  routeTokenCatalog,
  type RouteCatalogMap,
  type RouteDispatchResult,
  type RouteLookupByVerb,
  type RouteSpec,
  type RouteTemplate,
} from '@shared/type-level-fabric';

import type { DeepInterfaceChain } from '@shared/type-level/stress-types';

export type ConductorSeed = {
  readonly domain: string;
  readonly tenant: string;
  readonly includeTelemetry: boolean;
  readonly controlIterations: number;
};

export type ConductorSnapshot = {
  readonly branch: BranchState;
  readonly routeCount: number;
  readonly pairCount: number;
  readonly profileDepth: number;
  readonly telemetryEnabled: boolean;
  readonly routeList: readonly string[];
};

type BranchState = 'recover' | 'dispatch' | 'observe' | 'simulate' | 'reconcile';

type RouteTuple = {
  readonly verb: RouteSpec['verb'];
  readonly entity: RouteSpec['entity'];
  readonly severity: RouteSpec['severity'];
  readonly routeId: string;
  readonly source: 'fabric';
};

type AtlasRouteMap = RouteCatalogMap<RouteTuple[]>;

const defaultSeed: ConductorSeed = {
  domain: 'incident',
  tenant: 'north-america',
  includeTelemetry: true,
  controlIterations: 11,
};

const buildPairs = (_domain: string, tenant: string): RouteTuple[] => {
  const entities = Object.values(routeBlueprintCatalog) as RouteSpec[];
  const verbs = ['recover', 'dispatch', 'observe', 'simulate', 'reconcile', 'drill', 'audit'];
  const severities = ['critical', 'high', 'medium', 'low', 'info', 'emergency'];
  return entities.slice(0, 8).map((entry, index) => ({
    verb: verbs[index % verbs.length] as RouteSpec['verb'],
    entity: entry.entity as RouteSpec['entity'],
    severity: severities[index % severities.length] as RouteSpec['severity'],
    routeId: `${tenant}-${index}`,
    source: 'fabric',
  }));
};

const buildTree = (seed: ConductorSeed): ReturnType<typeof buildRouteTree> => {
  const nodes: [string, string, string, string] = [
    seed.domain,
    seed.includeTelemetry ? 'telemetry' : 'control',
    'policy',
    'mesh',
  ];
  return buildRouteTree(nodes, 'recover');
};

const evaluateBranch = (tupleCount: number, routeList: readonly string[]): BranchState => {
  if (routeList.length >= 18) {
    return 'observe';
  }
  if (tupleCount > 6) {
    return 'dispatch';
  }
  if (tupleCount > 4) {
    return 'recover';
  }
  return 'reconcile';
};

const parseAndNormalize = (token: string) => {
  const parsed = parseRouteToken(token as `${string}:${string}:${string}:${string}`);
  return `${parsed.verb}-${parsed.entity}-${parsed.severity}-${parsed.id}`;
};

const parseTemplate = (value: string): RouteTemplate<string> => {
  if (!value.includes('/')) {
    throw new Error(`invalid template: ${value}`);
  }
  return value as RouteTemplate<string>;
};

const estimateDepth = (chain: DeepInterfaceChain): number => {
  return Math.max(1, Object.keys(chain).length);
};

const createDispatch = (tuple: RouteTuple): RouteDispatchResult<RouteSpec> => {
  const payload = buildCatalogFromSpec({
    verb: tuple.verb,
    entity: tuple.entity,
    severity: tuple.severity,
    routeId: tuple.routeId,
    source: tuple.source,
  });

  return {
    kind: 'dispatch',
    payload,
    transport: 'http',
    accepted: tuple.source === 'fabric',
  };
};

const runWithScope = async <T,>(callback: (resource: AsyncDisposableStack) => Promise<T>): Promise<T> => {
  await using scope = new AsyncDisposableStack();
  return callback(scope);
};

const createRouteDisposer = (scope: AsyncDisposableStack, routeId: string): AsyncDisposable => ({
  async [Symbol.asyncDispose]() {
    void scope;
    await Promise.resolve(routeId);
  },
});

export const useTypeLevelStressConductor = (
  initialSeed: ConductorSeed = defaultSeed,
): {
  seed: ConductorSeed;
  setSeed: (value: ConductorSeed) => void;
  snapshot: ConductorSnapshot;
  runCount: number;
  runConductor: () => Promise<void>;
  clearHistory: () => void;
  routePairs: readonly { readonly a: string; readonly b: string; readonly merged: string }[];
  routeMap: AtlasRouteMap;
  isRunning: boolean;
} => {
  const [seed, setSeed] = useState(initialSeed);
  const [routeList, setRouteList] = useState<readonly string[]>([]);
  const [branch, setBranch] = useState<BranchState>('recover');
  const [pairCount, setPairCount] = useState(0);
  const [routeCount, setRouteCount] = useState(0);
  const [runCount, setRunCount] = useState(0);
  const [isRunning, setRunning] = useState(false);
  const [runtimePairs, setRuntimePairs] = useState<{
    readonly a: string;
    readonly b: string;
    readonly merged: string;
  }[]>([]);

  const pairTuples = useMemo(() => buildPairs(seed.domain, seed.tenant), [seed.domain, seed.tenant]);

  const routeMap = useMemo<AtlasRouteMap>(() => {
    return mapRoutePayload(Object.values(routeBlueprintCatalog).slice(0, 6) as RouteSpec[]) as AtlasRouteMap;
  }, []);

  const tree = useMemo(() => buildTree(seed), [seed]);

  const routeByVerb = useMemo<RouteLookupByVerb<RouteTuple[], 'recover'>>(() => {
    return routeMap as RouteLookupByVerb<RouteTuple[], 'recover'>;
  }, [routeMap]);

  const refreshRuntime = useCallback(() => {
    const treeKeys = Object.keys(tree);
    setRouteList((current) => {
      const merged = [...current, ...treeKeys];
      return Array.from(new Set(merged));
    });
    setRouteCount(treeKeys.length);
    setPairCount(Object.keys(routeByVerb).length);
  }, [tree, routeByVerb]);

  const routeLookup = useMemo(() => {
    return routeTokenCatalog
      .map((value) => resolveRouteToken(value))
      .filter((item) => item.includes(':'))
      .slice(0, 30);
  }, []);

  const runConductor = async (): Promise<void> => {
    setRunning(true);

    await runWithScope(async (scope) => {
      await scope.use(createRouteDisposer(scope, `${seed.tenant}-${runCount}`));
      const discovered = await buildRecursiveRouteSet(
        pairTuples.map((entry) => `${entry.verb}:${entry.routeId}`),
      );

      const normalizedPairs = pairTuples
        .map((entry) => ({
          left: `${entry.entity}-${entry.verb}`,
          right: entry.routeId,
          merged: `${entry.verb}:${entry.entity}`,
        }));

      const normalized = normalizeRouteBatch(pairTuples.map((entry) => `${entry.verb}:${entry.entity}:${entry.severity}:${entry.routeId}`));
      const normalizedTokens = normalized.map((entry) => resolveRouteToken(entry));
      const branches = normalizedTokens
        .map((token) => parseAndNormalize(`${token}`))
        .map((entry) => `${entry}::${seed.domain}`);

      const templateMap = pairsToTemplate(branches);
      const routeDispatches = pairTuples.map((tuple) => createDispatch(tuple));
      const accepted = routeDispatches.filter((item) => item.accepted).length;

      void parseTemplate(`/recovery/${seed.domain}/${seed.tenant}/dispatch`);
      void discovered;
      void routeDispatches;
      void templateMap;

      setPairCount(Math.max(pairCount, discovered.length));
      setRouteCount(accepted + templateMap.length);
      setBranch(evaluateBranch(pairTuples.length, routeLookup.map((value) => value + seed.domain)));
      setRuntimePairs(
        normalizedPairs.map((entry) => ({
          a: entry.left,
          b: entry.right,
          merged: `${entry.merged}:${seed.domain}`,
        })),
      );
      setRouteList((previous) => {
        const next = [...previous, ...branches, ...templateMap];
        return next.slice(0, 60);
      });
      setRunCount((count) => count + 1);
      setRunning(false);
    });
  };

  const clearHistory = () => {
    setRouteList([]);
    setRouteCount(0);
    setPairCount(0);
    setBranch('recover');
    setRunCount(0);
    setRuntimePairs([]);
  };

  useEffect(() => {
    refreshRuntime();
  }, [refreshRuntime]);

  const snapshot: ConductorSnapshot = {
    branch,
    routeCount,
    pairCount,
    profileDepth: estimateDepth(pairTuples[0] as unknown as DeepInterfaceChain),
    telemetryEnabled: seed.includeTelemetry,
    routeList,
  };

  return {
    seed,
    setSeed,
    snapshot,
    runCount,
    runConductor,
    clearHistory,
    routePairs: runtimePairs,
    routeMap,
    isRunning,
  };
};

function pairsToTemplate(values: readonly string[]): readonly string[] {
  return values.map((value) => value.replace(/:/g, '/')).concat('template:stress');
}
