import type { NoInfer, RecursiveMerge } from '@shared/type-level';

export type RewriteVerb =
  | 'normalize'
  | 'rewire'
  | 'coerce'
  | 'reframe'
  | 'inject'
  | 'extract'
  | 'compose'
  | 'decompose'
  | 'route'
  | 'broadcast'
  | 'forward'
  | 'backfill'
  | 'rebind'
  | 'audit'
  | 'observe'
  | 'bridge'
  | 'mesh'
  | 'signal'
  | 'artifact'
  | 'registry'
  | 'provision'
  | 'quarantine'
  | 'validate';

export type RewriteScope =
  | 'ingest'
  | 'dispatch'
  | 'validate'
  | 'transform'
  | 'observe'
  | 'synth'
  | 'audit'
  | 'bridge'
  | 'mesh'
  | 'signal'
  | 'artifact'
  | 'registry';

export interface RewriteCarrier<T extends RewriteVerb> {
  readonly verb: T;
  readonly label: `${T}-${number}`;
  readonly index: number;
}

export interface RewriteScopeContext<T extends RewriteScope> {
  readonly scope: T;
  readonly mode: `mode-${T}`;
}

export interface RewriteEnvelope<T extends RewriteVerb, S extends RewriteScope, D extends boolean = false>
  extends RewriteCarrier<T>,
    RewriteScopeContext<S> {
  readonly dryRun: D;
  readonly chainDepth: 26;
  readonly chainSignature: `${T}:${S}`;
}

export type RewriteEnvelopeByVerb<T extends RewriteVerb> =
  T extends 'normalize'
    ? RewriteEnvelope<'normalize', 'transform'>
    : T extends 'rewire'
      ? RewriteEnvelope<'rewire', 'bridge', true>
      : T extends 'coerce'
        ? RewriteEnvelope<'coerce', 'validate', true>
        : T extends 'reframe'
          ? RewriteEnvelope<'reframe', 'audit'>
          : T extends 'inject'
            ? RewriteEnvelope<'inject', 'ingest'>
            : T extends 'extract'
              ? RewriteEnvelope<'extract', 'dispatch'>
              : T extends 'compose'
                ? RewriteEnvelope<'compose', 'transform'>
                : T extends 'decompose'
                  ? RewriteEnvelope<'decompose', 'transform', true>
                  : T extends 'route'
                    ? RewriteEnvelope<'route', 'dispatch'>
                    : T extends 'broadcast'
                      ? RewriteEnvelope<'broadcast', 'observe'>
                      : T extends 'forward'
                        ? RewriteEnvelope<'forward', 'bridge'>
                        : T extends 'backfill'
                          ? RewriteEnvelope<'backfill', 'synth'>
                          : T extends 'rebind'
                            ? RewriteEnvelope<'rebind', 'registry'>
                            : RewriteEnvelope<T, 'registry'>;

export type RewritePayload<T extends string> =
  T extends `${infer Prefix}_${infer Mid}_${infer Suffix}`
    ? { readonly prefix: Prefix; readonly mid: Mid; readonly suffix: Suffix }
    : { readonly fallback: T };

export type RewriteIndex<T extends string> =
  T extends `${infer Head}-${infer Tail}`
    ? Head extends `${number}`
      ? 'number'
      : Tail extends `${infer _}:${infer _}`
        ? 'scoped'
        : 'raw'
    : never;

export type RewriteTuple<
  N extends number,
  T extends unknown[] = [],
> = T['length'] extends N ? T : RewriteTuple<N, [...T, { readonly slot: T['length']; readonly marker: `slot-${T['length']}` }] >;

export type RewriteStateDepth<
  Depth extends number,
  T extends unknown[] = [],
> = T['length'] extends Depth ? T : RewriteStateDepth<Depth, [...T, { readonly depth: T['length'] }] >;

export type RewriteTree<T, D extends number = 6> =
  D extends 0
    ? { readonly done: true }
    : T extends readonly [infer H, ...infer R]
      ? {
          readonly head: H;
          readonly tail: RewriteTree<R, D extends 6
            ? 5
            : D extends 5
              ? 4
              : D extends 4
                ? 3
                : D extends 3
                  ? 2
                  : D extends 2
                    ? 1
                    : D extends 1
                      ? 0
                      : 0>;
        }
      : { readonly head: never; readonly tail: { readonly done: true } };

export type RewriteNode<T extends RewriteVerb, S extends RewriteScope> = {
  readonly verb: T;
  readonly scope: S;
  readonly payload: RewritePayload<`${string}-${T}-${S}`>;
  readonly indexType: RewriteIndex<`${T}-${S}`>;
};

export interface RewriteConfig<T extends RewriteVerb = RewriteVerb, S extends RewriteScope = RewriteScope> {
  readonly namespace: `rewrite-${T}`;
  readonly verbs: readonly NoInfer<T>[];
  readonly scope: S;
  readonly nodes: readonly RewriteNode<T, S>[];
}

export type RewriteChain<T extends readonly RewriteVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends RewriteVerb
      ? Tail extends readonly RewriteVerb[]
        ? {
            readonly current: Head;
            readonly payload: RewriteEnvelopeByVerb<Head>;
            readonly next: RewriteChain<Tail>;
          }
        : { readonly current: never; readonly next: never }
      : never
    : { readonly current: 'normalize'; readonly payload: RewriteEnvelope<'normalize', 'transform'>; readonly next: { readonly done: true } };

export type NestedTemplateRemap<T extends object> = {
  readonly [K in keyof T as K extends `__${string}` ? never : `rewrite_${K & string}`]:
    T[K] extends object ? NestedTemplateRemap<T[K]> : T[K];
};

export type BuildRewriteGraph<T extends readonly RewriteVerb[]> = {
  readonly nodes: {
    [K in keyof T & number]: RewriteNode<T[K], RewriteScope>;
  };
  readonly chain: RewriteChain<T>;
  readonly states: RewriteStateDepth<6>;
};

export const rewriteSampleRoutes = [
  'normalize-transform-01',
  'rewire-bridge-02',
  'coerce-validate-03',
  'decompose-transform-04',
  'route-dispatch-05',
  'backfill-synth-06',
] as const satisfies readonly string[];

export const parseRewriteLabel = <T extends string>(raw: T): RewritePayload<T> => {
  if (!raw.includes('-')) {
    return { fallback: raw } as RewritePayload<T>;
  }
  const [prefix, mid, suffix] = raw.split('-', 3);
  return {
    prefix,
    mid: mid ?? 'raw',
    suffix: suffix ?? 'raw',
  } as RewritePayload<T>;
};

export const rewriteChainCatalog = <T extends readonly RewriteVerb[]>(verbs: [...T]): BuildRewriteGraph<T> => {
  const values: Partial<BuildRewriteGraph<T>> = {};
  const nodes = verbs.map((verb, index) => ({
    verb,
    scope: 'transform',
    payload: parseRewriteLabel(`${verb}-transform-${String(index).padStart(2, '0')}`),
    indexType: (index % 2 === 0 ? 'number' : 'raw') as RewriteIndex<`${typeof verb}-${'transform'}`>,
  })) as unknown as {
    [K in keyof T & number]: RewriteNode<T[K], RewriteScope>;
  };

  const chain = verbs.reduceRight(
    (tail, verb) =>
      ({
        current: verb,
        payload: {} as unknown as RewriteEnvelopeByVerb<typeof verb>,
        next: tail as unknown,
      }) as unknown as RewriteChain<readonly RewriteVerb[]>,
    {
      current: 'normalize' as RewriteVerb,
      payload: {} as RewriteEnvelopeByVerb<'normalize'>,
      next: { done: true },
    } as unknown as RewriteChain<readonly RewriteVerb[]>,
  ) as unknown as BuildRewriteGraph<T>['chain'];

  return {
    nodes,
    chain,
    states: Array.from({ length: 6 }, (_, depth) => ({ depth })) as unknown as RewriteStateDepth<6>,
  };
};

export const rewriteGraph = <
  T extends readonly RewriteVerb[],
  S extends readonly RewriteScope[],
>(verbs: [...T], scopes: [...S]): BuildRewriteGraph<T> => {
  const nodes = verbs.map((verb, index) => ({
    verb,
    scope: (scopes[index] ?? 'transform') as RewriteScope,
    payload: parseRewriteLabel(rewriteSampleRoutes[index] ?? `${verb}-auto-00`),
    indexType: 'raw' as RewriteIndex<`${T & string}-${S & string}`>,
  })) as unknown as BuildRewriteGraph<T>['nodes'];
  const chain = verbs.reduceRight(
    (tail, verb) =>
      ({
        current: verb,
        payload: {} as unknown as RewriteEnvelopeByVerb<typeof verb>,
        next: tail as unknown,
      }) as unknown as RewriteChain<readonly RewriteVerb[]>,
    {
      current: 'normalize' as RewriteVerb,
      payload: {} as RewriteEnvelopeByVerb<'normalize'>,
      next: { done: true },
    } as unknown as RewriteChain<readonly RewriteVerb[]>,
  ) as unknown as BuildRewriteGraph<T>['chain'];

  return {
    nodes,
    chain,
    states: [] as unknown as RewriteStateDepth<6>,
  };
};

export const buildEngineConfig = <T extends RewriteVerb, S extends RewriteScope>(
  namespace: `rewrite-${T}`,
  verbs: readonly NoInfer<T>[],
  scope: S,
): RewriteConfig<T, S> => {
  return {
    namespace,
    verbs,
    scope,
    nodes: [
      {
        verb: (verbs[0] ?? ('normalize' as T)),
        scope,
        payload: { prefix: 'rewrite', mid: 'seed', suffix: 'auto' } as RewritePayload<`rewrite-${T & string}-seed`>,
        indexType: 'scoped' as RewriteIndex<`${T & string}-${S & string}`>,
      } as unknown as RewriteNode<T, S>,
    ] as unknown as readonly RewriteNode<T, S>[],
  };
};

export const blendRewriteCatalog = <A extends Record<string, unknown>, B extends Record<string, unknown>>(
  first: A,
  second: B,
): RecursiveMerge<A, B> => {
  return {
    ...first,
    ...second,
  } as RecursiveMerge<A, B>;
};
