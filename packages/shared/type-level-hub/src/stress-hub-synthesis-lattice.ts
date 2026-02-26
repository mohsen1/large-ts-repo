export type HubMode = 'orchestrate' | 'simulate' | 'validate' | 'replay' | 'throttle';
export type HubStatus = 'idle' | 'running' | 'escalating' | 'resolved' | 'blocked';

export interface HubNode {
  readonly id: string;
  readonly mode: HubMode;
  readonly status: HubStatus;
  readonly rank: number;
}

export interface HubEnvelope<TMode extends HubMode, TStatus extends HubStatus, TPayload> {
  readonly mode: TMode;
  readonly status: TStatus;
  readonly payload: TPayload;
  readonly signature: `${TMode}:${TStatus}:${number}`;
}

export type HubLayerSeed = {
  readonly catalog: readonly string[];
  readonly status: readonly HubStatus[];
  readonly nodes: readonly HubNode[];
};

export type RouteFromCatalog<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends string ? `/${T[K]}/route/${K & string}` : never;
};

export type HubProjection<T extends HubLayerSeed> = {
  readonly routes: RouteFromCatalog<T['catalog']>;
  readonly statuses: T['status'][number][];
  readonly ranked: {
    readonly [K in T['nodes'][number] as K['id']]: K['rank'];
  };
};

export type HubPayloadTuple<T extends readonly HubNode[]> = {
  [K in keyof T]: T[K] extends infer TNode
    ? TNode extends HubNode
      ? HubEnvelope<TNode['mode'], TNode['status'], TNode>
      : never
    : never;
};

export const normalizeHubSeed = <T extends HubLayerSeed>(seed: T): HubProjection<T> => {
  const routes = seed.catalog.map((entry, index) => `/${entry}/route/${index}`) as RouteFromCatalog<T['catalog']>;
  const statuses = [...seed.status] as T['status'][number][];
  const ranked = seed.nodes.reduce(
    (acc, node) => {
      (acc as Record<string, number>)[node.id] = node.rank;
      return acc;
    },
    {} as HubProjection<T>['ranked'],
  );
  return { routes, statuses, ranked };
};

export const buildHubEnvelope = <
  TMode extends HubMode,
  TStatus extends HubStatus,
  TPayload,
>(
  mode: TMode,
  status: TStatus,
  payload: TPayload,
): HubEnvelope<TMode, TStatus, TPayload> => {
  return {
    mode,
    status,
    payload,
    signature: `${mode}:${status}:${Math.floor(Date.now())}`,
  } as HubEnvelope<TMode, TStatus, TPayload>;
};

export const hubEnvelopeTuple = <
  const TNodes extends readonly HubNode[],
>(nodes: TNodes): HubPayloadTuple<TNodes> => {
  const payloads = nodes.map((node) => buildHubEnvelope(node.mode as HubNode['mode'], node.status as HubNode['status'], node));
  return payloads as HubPayloadTuple<TNodes>;
};

export const hubRouteSignature = <
  TCatalog extends readonly string[],
>(catalog: TCatalog): `routes:${TCatalog['length']}` => {
  return `routes:${catalog.length}` as `routes:${TCatalog['length']}`;
};

export type HubLayerUnion<T extends HubLayerSeed> = {
  readonly seed: T;
  readonly projection: HubProjection<T>;
  readonly signature: ReturnType<typeof hubRouteSignature<readonly string[]>>;
};

export const createHubLayerUnion = <T extends HubLayerSeed>(seed: T): HubLayerUnion<T> => {
  const projection = normalizeHubSeed(seed);
  return {
    seed,
    projection,
    signature: `routes:${seed.catalog.length}` as HubLayerUnion<T>['signature'],
  };
};

export const createHubEnvelope = <
  TMode extends HubMode,
  TStatus extends HubStatus,
  TPayload,
>(
  mode: TMode,
  status: TStatus,
  payload: TPayload,
): HubEnvelope<TMode, TStatus, TPayload> => buildHubEnvelope(mode, status, payload);
