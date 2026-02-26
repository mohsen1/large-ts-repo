export type InvariantBox<T> = {
  value: T;
};

export type ContravariantHandler<TArg, TReturn> = (arg: TArg) => TReturn;
export type BivariantHandler<T> = ((value: T) => T) & ((value: Readonly<T>) => Readonly<T>);

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Branded<T, B extends string> = T & { readonly __brand: B };
export type Tag<T extends string> = Branded<T, 'Tag'>;

export type ConstraintTuple<T extends readonly unknown[]> = {
  readonly length: T['length'];
  readonly values: T;
};

export type ConstraintEnvelope<
  A extends string,
  B extends string,
  C extends Record<string, A>,
> = {
  readonly anchor: A;
  readonly extension: B;
  readonly catalog: C;
  readonly union: `${A}:${B}`;
};

export type ResolveConstraintSet<
  A extends string,
  B extends A,
  C extends string[] = [A, B],
> = {
  readonly anchor: A;
  readonly extension: B;
  readonly set: Readonly<C>;
  readonly union: A | B;
};

export interface ConstraintFunctionSet {
  <T extends string>(value: T): Tag<T>;
  <T extends string, K extends string>(value: T, scope: K): Tag<`${T}:${K}`>;
  <T extends string, K extends string, L extends string>(value: T, scope: K, layer: L): Tag<`${T}:${K}:${L}`>;
}

export const resolveConstraintName = <T extends string>(value: T): Tag<T> => `${value}-tag` as Tag<T>;

export const overloadConstraintName: ConstraintFunctionSet = ((value: string, scope?: string, layer?: string): Tag<string> => {
  if (scope === undefined) {
    return `${value}-tag` as Tag<string>;
  }
  if (layer === undefined) {
    return `${value}-${scope}` as Tag<string>;
  }
  return `${value}-${scope}-${layer}` as Tag<string>;
}) as unknown as ConstraintFunctionSet;

export type ChainState<T, C extends readonly [unknown, ...unknown[]]> = {
  readonly state: T;
  readonly constraints: C;
};

export type PipelineInput<TState, TConstraint extends string> = TState & { readonly constraint: TConstraint };

export type PipelineFactory<
  TState,
  TConstraint extends string,
  TResult,
> = (state: PipelineInput<TState, TConstraint>) => TResult;

export type HigherOrderConstraintFactory<
  TSeed extends string,
  TConstraint extends string,
> = <TState>(state: TState, constraint: TConstraint) => ChainState<TState & { readonly seed: TSeed }, [TState, TSeed]>;

export const createConstraintFactory = <TSeed extends string>(seed: TSeed): HigherOrderConstraintFactory<TSeed, Tag<TSeed>> => {
  return <TState>(state: TState, constraint: Tag<TSeed>) => ({
    state: { ...state, seed },
    constraints: [state, constraint],
  });
};

export function executeConstraintChain<TState, TConstraint extends string>(state: TState, constraint: TConstraint): ChainState<TState, [TState, TConstraint]>;
export function executeConstraintChain<TState, TConstraint extends string, TExt>(state: TState, constraint: TConstraint, ext: TExt): ChainState<TState & TExt, [TState, TConstraint, TExt]>;
export function executeConstraintChain<TState, TConstraint extends string, TExt extends object>(
  state: TState,
  constraint: TConstraint,
  ext?: TExt,
): ChainState<TState, [TState, TConstraint] | [TState, TConstraint, TExt]> {
  return ext === undefined
    ? { state, constraints: [state, constraint] }
    : { state: { ...state, ...ext }, constraints: [state, constraint, ext] };
}

export function buildConstraintUnion<T extends string[]>(...types: T): Readonly<T> {
  return types;
}

export function buildConstraintUnionWithConstraint<
  A extends string,
  B extends string,
  C extends ConstraintTuple<readonly [string]>,
>(a: A, b: B, ...rest: C['values']): ConstraintEnvelope<A, B, Record<string, A>> {
  return {
    ...Object.fromEntries(rest.map((value, index) => [`rest-${index}`, value])),
    ...({} as Record<string, A>),
    anchor: a,
    extension: b,
    catalog: Object.fromEntries(rest.map((value, index) => [`constraint-${index}`, a])) as Record<string, A>,
    union: `${a}:${b}`,
  } as ConstraintEnvelope<A, B, Record<string, A>>;
};

export const withConstraintAdapters = <TReturn>(seed: TReturn) => {
  const adapters: Array<(value: string, constraint?: string) => TReturn> = [
    () => seed,
    () => seed,
  ];
  return {
    run: (input: string) =>
      adapters.reduce<TReturn>((acc, adapter) => adapter((acc as unknown as string)), seed),
    chain: (input: string, ...constraints: string[]) => {
      const values = constraints.map((constraint, index) => `${input}:${constraint}:${index}`).join(':');
      return `${values}` as unknown as TReturn;
    },
  };
};

export type ConstraintSatisfaction<
  TInput,
  TConstraint extends string = never,
> = TInput extends { constraint: infer T } ? (T extends TConstraint ? true : false) : false;

export const satisfiesConstraintSet = <TInput, TConstraint extends string>(
  candidate: TInput,
  constraint: NoInfer<TConstraint>,
): ConstraintSatisfaction<TInput, TConstraint> => {
  return ((candidate as { constraint: TConstraint }).constraint === constraint) as ConstraintSatisfaction<TInput, TConstraint>;
};

export interface PipelineCatalog {
  readonly name: string;
  readonly handlers: readonly string[];
}

export const chainPipeline = <TInput extends PipelineCatalog, TOutput>(
  input: TInput,
  handler: ContravariantHandler<TInput, TOutput>,
): TOutput => handler(input);
