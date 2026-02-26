export type IntersectionLayerA = { readonly id: string; readonly mode: 'read' | 'write'; readonly region: 'core' };
export type IntersectionLayerB = { readonly id: string; readonly mode: 'write'; readonly weight: number };
export type IntersectionLayerC = { readonly id: `c-${string}`; readonly active: boolean; readonly tags: readonly string[] };
export type IntersectionLayerD = { readonly version: 1; readonly strategy: 'alpha' };
export type IntersectionLayerE = { readonly version: number; readonly strategy: 'beta' | 'gamma' };
export type IntersectionLayerF = { readonly policy: { critical: boolean }; readonly region: string };
export type IntersectionLayerG = { readonly tags: ReadonlyArray<string>; readonly channel: 'mesh' };
export type IntersectionLayerH = { readonly channel: 'api'; readonly region: 'edge' | 'core' };
export type IntersectionLayerI = { readonly owner: `owner-${string}`; readonly active: false };
export type IntersectionLayerJ = { readonly owner: string; readonly ownerId: `owner-${number}` };
export type IntersectionLayerK = { readonly metrics: { latency: number; throughput: number } };
export type IntersectionLayerL = { readonly metrics: { throughput: number; errorRate: number } };
export type IntersectionLayerM = { readonly score: number; readonly confidence: number };
export type IntersectionLayerN = { readonly score: string; readonly confidence: number };
export type IntersectionLayerO = { readonly schedule: { window: 'short' | 'long' } };
export type IntersectionLayerP = { readonly schedule: { window: string; repeat: boolean } };
export type IntersectionLayerQ = { readonly timeline: { start: number; end: number } };
export type IntersectionLayerR = { readonly timeline: { start: number; end: number; paused: boolean } };
export type IntersectionLayerS = { readonly mode: 'hybrid'; readonly channels: readonly ['http', 'grpc'] };
export type IntersectionLayerT = { readonly mode: string; readonly channels: readonly string[] };

export type FoldIntersection<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head & FoldIntersection<Tail>
  : {};

export type CanonicalCollision<T> =
  T extends { id: infer A }
    ? T extends { id: infer B }
      ? { [K in keyof T]: K extends 'id' ? `${A & string}-${B & string}` : T[K] }
      : T
    : T;

export type LayerConflictReducer<T> =
  T extends { mode: infer M1 }
    ? T extends { mode: infer M2 }
      ? { mode: M1 & M2 }
      : T
    : T;

export type IntersectWithConflicts = LayerConflictReducer<
  CanonicalCollision<
    FoldIntersection<[
      IntersectionLayerA,
      IntersectionLayerB,
      IntersectionLayerC,
      IntersectionLayerD,
      IntersectionLayerE,
      IntersectionLayerF,
      IntersectionLayerG,
      IntersectionLayerH,
      IntersectionLayerI,
      IntersectionLayerJ,
      IntersectionLayerK,
      IntersectionLayerL,
      IntersectionLayerM,
      IntersectionLayerN,
      IntersectionLayerO,
      IntersectionLayerP,
      IntersectionLayerQ,
      IntersectionLayerR,
      IntersectionLayerS,
      IntersectionLayerT,
    ]>
  >>;

export type ReconciledNode = {
  [K in keyof IntersectWithConflicts]: K extends 'id'
    ? string
    : K extends 'score'
      ? number
      : K extends 'mode'
        ? 'read' | 'write' | 'hybrid'
        : IntersectWithConflicts[K];
};

export const intersectionLayers: readonly ReconciledNode[] = [
  { id: 'a-1', mode: 'hybrid', region: 'core', weight: 10, active: true, tags: ['seed'], version: 1, strategy: 'beta', policy: { critical: true }, channel: 'api', owner: 'owner-0', ownerId: 'owner-10', metrics: { latency: 4, throughput: 100, errorRate: 0.02 }, schedule: { window: 'long', repeat: true }, timeline: { start: 0, end: 99, paused: false }, confidence: 0.91, score: 88 },
  { id: 'a-2', mode: 'hybrid', region: 'edge', ownerId: 'owner-12', owner: 'owner-12', channels: ['http', 'grpc'] },
] as const;

export type ProjectLayerKeys = keyof ReconciledNode;

export type ProjectByKey<T> = {
  [K in keyof T]: T[K] extends object
    ? {
        readonly key: K;
        readonly type: 'object';
      }
    : {
        readonly key: K;
        readonly type: 'primitive';
      };
};

export type LayerProjection = ProjectByKey<ReconciledNode>;

export const reconcileLayers = (): ReconciledNode => ({
  id: 'a-1',
  mode: 'hybrid',
  region: 'core',
  weight: 10,
  active: true,
  tags: ['seed'],
  version: 1,
  strategy: 'beta',
  policy: { critical: true },
  channel: 'api',
  owner: 'owner-0',
  ownerId: 'owner-10',
  metrics: { latency: 4, throughput: 100, errorRate: 0.02 },
  schedule: { window: 'long', repeat: true },
  timeline: { start: 0, end: 99, paused: false },
  channels: ['http', 'grpc'],
  confidence: 0.91,
  score: 88,
});

export function mergeIntersections<T extends readonly Record<string, unknown>[]>(
  ...layers: T
): FoldIntersection<T> & { readonly __count: T['length'] } {
  return Object.assign({}, ...layers, { __count: layers.length }) as FoldIntersection<T> & {
    readonly __count: T['length'];
  };
}

export function projectLayerKeys<T extends Record<string, unknown>>(value: T): ProjectByKey<T> {
  const out: Partial<Record<keyof T, { key: keyof T; type: 'object' | 'primitive' }>> = {};
  for (const key of Object.keys(value) as Array<keyof T>) {
    const candidate = value[key];
    out[key] = {
      key,
      type: typeof candidate === 'object' && candidate !== null ? 'object' : 'primitive',
    } as { key: keyof T; type: 'object' | 'primitive' };
  }
  return out as ProjectByKey<T>;
}

export function normalizeIntersection<T extends Record<string, unknown>>(input: T): ReconciledNode {
  return {
    ...reconcileLayers(),
    ...(input as Partial<ReconciledNode>),
  };
}
