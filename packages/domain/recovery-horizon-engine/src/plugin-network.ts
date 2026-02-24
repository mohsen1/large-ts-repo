import { type NoInfer } from '@shared/type-level';
import {
  horizonBrand,
  type HorizonPlan,
  type HorizonSignal,
  type JsonLike,
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type TimeMs,
} from './types.js';

export type StageRouteString<T extends readonly PluginStage[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends PluginStage
    ? Tail extends readonly PluginStage[]
      ? `${Head}${Tail extends readonly [] ? '' : `>${StageRouteString<Tail>}`}`
      : `${Head}`
    : never
  : never;

export type StageNetworkRoute<T extends readonly PluginStage[]> = T;
export type NetworkStageRoute<T extends readonly PluginStage[]> = StageNetworkRoute<T>;
export type StageNetwork<T extends readonly PluginStage[]> = readonly [...T];
export type StageNodeId<TKind extends PluginStage = PluginStage> = `${TKind}/${string}`;

type RouteNode<TWindow extends readonly PluginStage[]> = {
  readonly at: TWindow[number];
  readonly next: RouteNode<TWindow> | null;
};

export type NetworkRouteMap<TWindow extends readonly PluginStage[]> = {
  [K in TWindow[number]]: RouteNode<TWindow>;
};

export type NetworkStageMap<T extends readonly PluginStage[]> = {
  [K in T[number]]: {
    readonly maxConcurrency: number;
    readonly allowFallback: boolean;
    readonly fallbackKind: T[number];
  };
};

export type StageEdge<A extends PluginStage, B extends PluginStage> = `${A}=>${B}`;

export interface NetworkNode<TKind extends PluginStage = PluginStage, TConfig = JsonLike> {
  readonly id: StageNodeId<TKind>;
  readonly kind: TKind;
  readonly contract: PluginContract<TKind, PluginConfig<TKind, TConfig>, TConfig>;
  readonly weight: number;
  readonly requiredBy: readonly StageNodeId[];
}

export interface NetworkEdge {
  readonly from: StageEdge<PluginStage, PluginStage>;
  readonly latencyMs: TimeMs;
  readonly score: number;
}

export interface NetworkBlueprint<T extends readonly PluginStage[]> {
  readonly tenantId: string;
  readonly window: StageNetwork<T>;
  readonly nodes: readonly NetworkNode<T[number], JsonLike>[];
  readonly edges: readonly NetworkEdge[];
  readonly route: StageNetworkRoute<T>;
  readonly routeIndex: NetworkRouteMap<T>;
}

export type NodeRecord<TWindow extends readonly PluginStage[]> = {
  readonly [K in TWindow[number]]: K;
};

export type StageNetworkShape<T extends readonly PluginStage[]> = {
  readonly nodes: {
    readonly [K in T[number]]: {
      readonly id: StageNodeId<K>;
      readonly kind: K;
      readonly downstream: readonly StageNodeId<Exclude<T[number], K>>[];
      readonly policy: {
        [R in Exclude<T[number], K> as `${K}:${R}`]: {
          readonly route: StageRouteString<[K]>;
          readonly required: boolean;
        };
      };
    };
  };
  readonly edges: readonly StageEdge<T[number], T[number]>[];
};

export type NetworkPolicy<T extends readonly PluginStage[]> = {
  readonly key: `policy:${StageRouteString<T>}`;
  readonly allowParallel: boolean;
  readonly stageMatrix: NetworkStageMap<T>;
};

export interface NetworkTrace {
  readonly at: TimeMs;
  readonly stage: PluginStage;
  readonly node: string;
  readonly events: readonly string[];
}

const asWindow = <TWindow extends readonly PluginStage[]>(value: NoInfer<TWindow>): StageNetwork<TWindow> =>
  value as StageNetwork<TWindow>;

const asRoute = <TWindow extends readonly PluginStage[]>(value: NoInfer<TWindow>): NetworkStageRoute<TWindow> =>
  value as NetworkStageRoute<TWindow>;

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

export const resolvePolicy = <TWindow extends readonly PluginStage[]>(
  stageWindow: NoInfer<TWindow>,
): NetworkPolicy<TWindow> => {
  const matrix = {} as {
    [K in TWindow[number]]: {
      maxConcurrency: number;
      allowFallback: boolean;
      fallbackKind: TWindow[number];
    };
  };
  let cursor = 0;
  for (const stage of stageWindow) {
    matrix[stage as TWindow[number]] = {
      maxConcurrency: 1 + cursor,
      allowFallback: stage !== 'execute',
      fallbackKind: stage,
    };
    cursor += 1;
  }

  return {
    key: `policy:${asRoute(stageWindow).join('>') as StageRouteString<TWindow>}`,
    allowParallel: stageWindow.length > 3,
    stageMatrix: matrix,
  };
};

export const buildRoute = <TWindow extends readonly PluginStage[]>(
  stageWindow: NoInfer<TWindow>,
): StageNetwork<TWindow> => asWindow(stageWindow);

export const buildNodeMap = <TWindow extends readonly PluginStage[]>(
  tenant: string,
  stages: NoInfer<TWindow>,
  contracts: readonly PluginContract<TWindow[number], PluginConfig<TWindow[number], JsonLike>, JsonLike>[],
): Record<string, NetworkNode<TWindow[number], JsonLike>> => {
  const nodes: Record<string, NetworkNode<TWindow[number], JsonLike>> = {};

  for (const stage of stages) {
    const contract = contracts.find((entry) => entry.kind === stage);
    if (!contract) {
      continue;
    }
    const nodeId = `${tenant}/${stage}` as StageNodeId;
    nodes[nodeId] = {
      id: nodeId,
      kind: stage,
      contract: contract as PluginContract<TWindow[number], PluginConfig<TWindow[number], JsonLike>, JsonLike>,
      weight: stageWindowWeight(stage),
      requiredBy: [],
    };
  }
  return nodes;
};

const stageWindowWeight = (stage: PluginStage, base = 1): number =>
  base + ['ingest', 'analyze', 'resolve', 'optimize', 'execute'].indexOf(stage);

const buildRouteMap = <TWindow extends readonly PluginStage[]>(window: NoInfer<TWindow>): NetworkRouteMap<TWindow> => {
  const map = {} as Record<TWindow[number], RouteNode<TWindow> | null> as NetworkRouteMap<TWindow>;
  for (let index = 0; index < window.length; index += 1) {
    const current = window[index] as TWindow[number];
    map[current] = {
      at: current,
      next: index + 1 < window.length
        ? {
            at: window[index + 1] as TWindow[number],
            next: index + 2 < window.length
              ? {
                  at: window[index + 2] as TWindow[number],
                  next: null,
                }
              : null,
          }
        : null,
    } as RouteNode<TWindow>;
  }
  return map;
};

export const buildTopology = <TWindow extends readonly PluginStage[]>(
  tenant: string,
  stages: NoInfer<TWindow>,
  contracts: readonly PluginContract<TWindow[number], PluginConfig<TWindow[number], JsonLike>, JsonLike>[],
): NetworkBlueprint<TWindow> => {
  const window = buildRoute(stages);
  const record = buildNodeMap(tenant, stages, contracts);
  const edges = [...window.slice(1)].map((next, index) => ({
    from: `${window[index]}=>${next}` as StageEdge<PluginStage, PluginStage>,
    latencyMs: horizonBrand.fromTime(100 + index * 10),
    score: 1 / (index + 1),
  }));
  const nodes = Object.values(record) as readonly NetworkNode<TWindow[number], JsonLike>[];
  return {
    tenantId: tenant,
    window,
    nodes,
    edges,
    route: asRoute(stages),
    routeIndex: buildRouteMap(stages),
  };
};

export const collectTopologyNodes = <TWindow extends readonly PluginStage[]>(
  plan: HorizonPlan<TWindow[number]>,
): readonly NetworkTrace[] => {
  const out: NetworkTrace[] = [];
  const payload = plan.payload as { stageWindow?: readonly PluginStage[] } | undefined;
  const route = Array.isArray(payload?.stageWindow) ? payload.stageWindow : [];
  let cursor = 0;

  for (const stage of route) {
    const at = now();
    out.push({
      at,
      stage,
      node: `${plan.id}/${stage}`,
      events: ['enter', `offset:${cursor}`, `time:${at}`],
    });
    cursor += 1;
  }
  return out;
};

export const normalizeNodes = (edges: readonly NetworkEdge[]): readonly NetworkEdge[] => {
  if (!edges.length) {
    return [];
  }
  return [edges[0], ...edges.slice(1)];
};

export { buildRouteMap };
