import {
  type ChainNode0,
  type ChainNode35,
  type ChainByWeight,
  type DeepInterfaceUnion,
  makeChainProbe,
  chainAnchor,
  chainCompatibility,
  layerValue,
  type Layer10,
} from '@shared/type-level/stress-hierarchy-chain-architecture';
import {
  type GalaxyRoute,
  resolveDispatchMatrix,
  galaxyDispatchMatrix,
} from '@shared/type-level/stress-conditional-dispatch-galaxy';
import { routeDecisions as resolveRouteDecisions } from '@shared/type-level/stress-conditional-depth-grid';
import {
  type BuildAccumulator,
  type BuildTuple,
  type FoldRecursive,
  resolveRecursive,
  type RouteTuple,
  type RecursionLedger,
  type RouterConfig,
  type UnionFold,
} from '@shared/type-level/stress-recursive-constraint-orchestra';

type RecursionRoute = RouteTuple[0];

interface CascadeBranch<T extends DeepInterfaceUnion> {
  readonly source: T;
  readonly target: ChainByWeight<T>;
  readonly depth: T['weight'];
}

export type BranchMatrix = {
  readonly [K in ChainNode35['weight'] | 0]: CascadeBranch<Extract<DeepInterfaceUnion, { weight: K }>>;
};

const tuple = <N extends number>(size: N): BuildTuple<N, []> => {
  const out = [] as unknown[];
  for (let i = 0; i < size; i += 1) {
    out.push(i);
  }
  return out as BuildTuple<N, []>;
};

const accumulatorFromBranch = <T, N extends number>(value: T, depth: N): BuildAccumulator<T, N> => ({
  items: [...tuple(depth)].map(() => value) as BuildAccumulator<T, N>['items'],
  size: depth as BuildAccumulator<T, N>['size'],
});

const dispatchRoute = (galaxyDispatchMatrix[0] ?? undefined) as GalaxyRoute | undefined;

export const cascadeLayered = {
  anchor: chainAnchor,
  chain: makeChainProbe(chainAnchor),
  compatibility: chainCompatibility,
  layerValue: layerValue as Layer10<unknown>,
  dispatchRoute,
} satisfies {
  anchor: ChainNode35;
  chain: ReturnType<typeof makeChainProbe>;
  compatibility: typeof chainCompatibility;
  layerValue: Layer10<unknown>;
  dispatchRoute?: GalaxyRoute;
};

export type RecursionEnvelope = {
  readonly config: RouterConfig<RecursionRoute, 6>;
  readonly recursion: FoldRecursive<string, 16>;
  readonly ledger: RecursionLedger<string, 9>;
};

export const recursionRouteTuple = [
  '/simulate/fabric/critical/id-alpha',
  accumulatorFromBranch('simulate', 8),
] as unknown as RouteTuple;

export class CascadeNode {
  readonly source: DeepInterfaceUnion;
  readonly history: readonly string[];
  constructor(source: DeepInterfaceUnion, history: readonly string[] = []) {
    this.source = source;
    this.history = history;
  }

  transition(next: ChainByWeight<DeepInterfaceUnion>, note: string): CascadeNode {
    return new CascadeNode(next as unknown as DeepInterfaceUnion, [...this.history, note]);
  }

  replay(): readonly string[] {
    return [...this.history];
  }
}

export const cascadeBuilder = <
  const Start extends DeepInterfaceUnion,
  const Routes extends readonly GalaxyRoute[],
>(start: Start, routes: Routes) => {
  const node = new CascadeNode(start as unknown as DeepInterfaceUnion);

  const traced = routes.flatMap((route, index) => {
    const decision = resolveRouteDecisions.get(route as unknown as string);
    if (!decision) {
      return [] as string[];
    }

    const nextWeight = Math.min(35, index + 3) as ChainNode35['weight'];
    const next = {
      node: `N${nextWeight}`,
      weight: nextWeight,
      stamp: `${index + 3}`,
    } as unknown as ChainByWeight<DeepInterfaceUnion>;

    const transition = node.transition(next, decision.path);
    return [...transition.replay(), route];
  });

  const accumulator = accumulatorFromBranch(start.weight, start.weight % 10);
  return {
    node,
    traced,
    total: traced.length,
    accumulator,
  };
};

export const unionFoldTest = (nodes: readonly DeepInterfaceUnion[]): number => {
  const union = nodes.map((node) => node.weight as unknown as number);
  return union.reduce((acc, next) => acc + next, 0);
};

export const mapDepth = <T extends readonly DeepInterfaceUnion[]>(nodes: T): readonly number[] =>
  nodes.map((node) => node.weight as number);

export const branchPlan = cascadeBuilder(chainAnchor, cascadeLayered.dispatchRoute ? [cascadeLayered.dispatchRoute] : []);

export const routeDecisionMap = new Map(
  [...(resolveRouteDecisions.entries() as IterableIterator<[string, { readonly source: string; readonly decision: 'accept' | 'reject'; readonly path: string; readonly reason?: string }]>)]
    .map(([route, decision]) => [route, decision.path]),
);

export const branchPlanDigest = {
  total: branchPlan.total,
  history: branchPlan.traced,
  accumulatorSize: branchPlan.accumulator.size,
  firstDecision: [...routeDecisionMap.entries()][0]?.[1],
};

export const buildCascadeEnvelope = (route: RecursionRoute, tenant: string): RecursionEnvelope => {
  const normalized = route.replace('/', '-') as RouteTuple[0];
  const ledger = {
    terminal: route,
    trace: [normalized, tenant],
  } as unknown as RecursionEnvelope['ledger'];
  const recursive = resolveRecursive('recover') as unknown as RecursionEnvelope['config']['recursive'];
  const recursion = resolveRecursive('recover') as unknown as FoldRecursive<string, 16>;
  return {
    config: {
      route,
      depth: 6,
      recursive: recursive,
    },
    recursion,
    ledger,
  };
};

export type BranchRoute = keyof typeof matrix;

const matrix = {
  '/recover/fabric': 'recover',
  '/recover/signal': 'recover',
  '/simulate/fabric': 'simulate',
  '/simulate/signal': 'simulate',
  '/rollback/fabric': 'rollback',
} as const;
