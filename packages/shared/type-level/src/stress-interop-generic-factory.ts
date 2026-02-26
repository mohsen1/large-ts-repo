export type ServicePayload<K extends string, P> = Readonly<{
  readonly kind: K;
  readonly payload: P;
}>;

export type VariantSelector<
  K extends string,
  P,
  L extends readonly string[],
> = L extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? ServicePayload<`${K}.${Head}`, P>
    : ServicePayload<K, P>
  : ServicePayload<K, P>;

type NestedVariantUnion<
  K extends string,
  P,
  Depth extends number,
> = Depth extends 0 ? ServicePayload<K, P> : VariantSelector<K, P, ['alpha', 'beta', 'gamma', 'delta', 'epsilon']>;

export type FactoryInput<K extends string, P, V extends number = 4> = V extends 0
  ? NestedVariantUnion<K, P, V>
  : {
      readonly key: K;
      readonly payload: NestedVariantUnion<K, P, V>;
      readonly nested: FactoryInput<`${K}-x`, P, DecrementDepth<V>>;
    };

type BuildDepthTuple<T extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends T
  ? Acc
  : BuildDepthTuple<T, [...Acc, unknown]>;
type DecrementDepth<T extends number> = T extends 0 ? 0 : BuildDepthTuple<T> extends [...infer Prefix, unknown] ? Prefix['length'] : 0;

export type FactoryDispatch<T> = T extends ServicePayload<infer K, infer P>
  ? (input: P) => Promise<{ kind: K; payload: P }>
  : never;

export type OverloadedFactory =
  (<T extends string, U>(kind: T, payload: U) => ServicePayload<T, U>) &
  (<T extends string, U>(kind: T, payload: U, trace: string) => ServicePayload<T & string, U & { trace: string }>) &
  (<T extends string, U>(kind: T, payload: U, trace: string, retry: number) => ServicePayload<T, U>) &
  (<T extends string, U>(kind: T, payload: U, trace: string, retry: number, tenant: string) => ServicePayload<T, U>) &
  (<T extends string, U>(kind: T, payload: U, trace: string, retry: number, tenant: string, priority: number) => ServicePayload<T, U & { priority: number }> ) &
  (<T extends string, U>(
    kind: T,
    payload: U,
    trace: string,
    retry: number,
    tenant: string,
    priority: number,
    source: string,
  ) => ServicePayload<T, U & { source: string }>);

export const createFactory = <TKind extends string>(kind: TKind): OverloadedFactory => {
  const create = ((k: string, payload: unknown, ..._: unknown[]) => ({
    kind: k,
    payload,
  })) as OverloadedFactory;

  return create;
};

export const createLayeredFactory = <TDomain extends string>(domain: TDomain) => {
  const base = createFactory<string>(`${domain}.base`);
  return <TVerb extends string, TPayload>(
    verb: TVerb,
    payload: TPayload,
  ): ServicePayload<`${TDomain}.${TVerb}`, TPayload> =>
    base(`${domain}.${verb}`, payload as TPayload & { trace?: string }) as ServicePayload<`${TDomain}.${TVerb}`, TPayload>;
};

export type DispatchCatalog<T extends readonly string[]> = {
  [K in keyof T & number]: T[K] extends string ? ServicePayload<T[K], { readonly index: K }> : never;
};

type BuildDispatcher<
  T extends readonly string[],
  Acc extends readonly ServicePayload<string, unknown>[] = [],
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? BuildDispatcher<Tail & readonly string[], [...Acc, ServicePayload<Head, { readonly selected: Head }>]>
    : Acc
  : Acc;

export type BuildDispatchers<T extends readonly string[]> = BuildDispatcher<T>;

export type UnionFold<T> = T extends readonly [infer Head, ...infer Tail]
  ? Head | UnionFold<Tail>
  : never;

export type Unionize<T> = UnionFold<T extends readonly unknown[] ? T : readonly []>;

export type FoldedDispatcher<T extends readonly string[]> = Unionize<BuildDispatchers<T>>;

export const executeFactories = <TConfig extends readonly string[]>(
  config: TConfig,
): BuildDispatchers<TConfig> => {
  const out: ServicePayload<string, unknown>[] = [];
  const factory = createFactory<'orchestrator'>('orchestrator');

  for (const command of config) {
    out.push(factory(command, { selected: command }));
  }

  return out as BuildDispatchers<TConfig>;
};

export const collectFactoryMap = <TConfig extends readonly string[]>(
  config: TConfig,
): DispatchCatalog<TConfig> => {
  const entries = config.map((command, index) => ({
    kind: command,
    payload: { index },
  }));
  return Object.fromEntries(entries.map((entry, index) => [index, entry])) as DispatchCatalog<TConfig>;
};

export const dispatchCatalog = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'] as const;
