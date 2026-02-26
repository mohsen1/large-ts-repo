type BoundedDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

type Decrement = {
  0: 0;
  1: 0;
  2: 1;
  3: 2;
  4: 3;
  5: 4;
  6: 5;
  7: 6;
  8: 7;
  9: 8;
  10: 9;
  11: 10;
  12: 11;
  13: 12;
  14: 13;
  15: 14;
};

export type Branded<T, B extends string> = T & { readonly __brand: B };
export type NoInfer<T> = [T][T extends any ? 0 : never];

type BuildTupleImpl<T, N extends BoundedDepth, TAcc extends readonly T[] = []> =
  N extends 0 ? TAcc : BuildTupleImpl<T, Decrement[N], readonly [...TAcc, T]>;

export type BuildTuple<T, N extends BoundedDepth> = BuildTupleImpl<T, N>;

type RevTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [...RevTuple<Tail>, Head]
  : readonly [];

export type MutRoot<T, D extends BoundedDepth, TAcc> = D extends 0
  ? T
  : { readonly stage: 'inner'; readonly payload: T; readonly tuple: TAcc };

export type MutAlt<T, D extends BoundedDepth, TAcc> = D extends 0 ? T : MutRoot<T, Decrement[D], TAcc>;

export type MutAcc<T, D extends BoundedDepth> =
  D extends 0
    ? { readonly value: T; readonly depth: 0 }
    : { readonly value: T; readonly depth: D; readonly trace: MutAlt<T, Decrement[D], BuildTuple<T, D>> };

export type BuildChain<T, D extends BoundedDepth> = D extends 0
  ? readonly []
  : readonly [...BuildTuple<T, D>, T];

export interface OutputProducer<out T> {
  provide: () => T;
}

export interface OutputSink<in T> {
  consume: (value: T) => void;
}

export interface InputOutput<in TIn, out TOut> {
  set: (value: TIn) => void;
  get: () => TOut;
}

export type SolveConstraint<
  TSubject,
  TVerb extends string,
  TConstraint extends Record<TVerb, TSubject> = Record<TVerb, TSubject>,
> = {
  readonly subject: TSubject;
  readonly key: TVerb;
  readonly graph: TConstraint;
  readonly trace: string;
  readonly active: keyof TConstraint;
};

export interface ConstraintSolverOptions<T extends string> {
  readonly strict: boolean;
  readonly namespace: T;
  readonly namespaceSeed: `ns-${T}`;
}

export type ConstraintState<T, D extends BoundedDepth> = {
  readonly stage: 'root';
  readonly payload: T;
  readonly tuple: BuildTuple<T, D>;
};

export type MutualSolver<T, D extends BoundedDepth> = D extends 0
  ? ConstraintState<T, 0>
  : {
      readonly stage: 'recur';
      readonly input: T;
      readonly markers: RevTuple<BuildTuple<T, D>>;
      readonly depth: D;
      readonly next: ConstraintState<T, Decrement[D]>;
    };

export type NormalizeSolver<T, D extends BoundedDepth> = T extends { readonly mode: infer M; readonly value: infer V }
  ? M extends string
    ? { readonly normalized: `${M}:${D}`; readonly value: V; readonly marker: BuildTuple<T, D>[number] }
    : MutualSolver<T, D>
  : MutAcc<T, D>;

export type DeepResolveSolver<T, D extends BoundedDepth> = T extends { readonly kind: 'leaf'; readonly payload: infer Payload }
  ? NormalizeSolver<Payload, D>
  : NormalizeSolver<T, D>;

export type RouteSolverPayload<
  TDomain extends string,
  TVerb extends string,
  TSubject extends string,
  TConstraint extends Record<TVerb, TSubject>,
> = SolveConstraint<TSubject, TVerb, TConstraint> & {
  readonly domain: TDomain;
  readonly constraints: MutAcc<TConstraint, 8>;
};

export const makeSolver = <
  const TDomain extends string,
  const TVerb extends string,
  const TSubject extends string,
  const TConstraint extends Record<TVerb, TSubject> & Record<string, TSubject>,
>(
  domain: TDomain,
  verb: TVerb,
  subject: TSubject,
  graph: NoInfer<TConstraint>,
  options: ConstraintSolverOptions<TDomain>,
) => {
  const traceTuple = new Array(8).fill(graph) as unknown as BuildTuple<TConstraint, 8>;
  const tracePayload = {
    stage: 'inner' as const,
    payload: graph,
    tuple: traceTuple,
  };
  return {
    domain,
    verb,
    subject,
    graph,
    options,
    solution: {
      domain,
      constraints: {
        value: graph,
        depth: 8,
        trace: tracePayload,
        active: Object.keys(graph)[0] as keyof TConstraint,
        // optional trace tuple alignment kept for template-literal depth fan-out
      } as MutAcc<TConstraint, 8>,
    },
  } as {
    readonly domain: TDomain;
    readonly verb: TVerb;
    readonly subject: TSubject;
    readonly graph: TConstraint;
    readonly options: ConstraintSolverOptions<TDomain>;
    readonly solution: RouteSolverPayload<TDomain, TVerb, TSubject, TConstraint>;
  };
};

export type SolverConstraint<
  TConstraint extends Record<string, unknown>,
  TKeys extends keyof TConstraint = keyof TConstraint,
> = TKeys extends keyof TConstraint
  ? { [K in TKeys]: { readonly key: K; readonly value: TConstraint[K]; readonly branded: Branded<K, 'KeyBrand'> } }[TKeys]
  : never;

export const solverConstraintLattice = <
  TConstraint extends Record<string, unknown>,
  TContext extends SolverConstraint<TConstraint>,
>(
  key: TContext['key'],
  value: TContext['value'],
  depth: BoundedDepth,
): SolverConstraint<TConstraint> => {
  if (depth === 0) {
    return {
      key,
      value,
      branded: `${String(key)}#` as Branded<string & TContext['key'], 'KeyBrand'>,
    } as SolverConstraint<TConstraint>;
  }
  return {
    key,
    value,
    branded: `${String(key)}#${depth}` as Branded<string & TContext['key'], 'KeyBrand'>,
  } as SolverConstraint<TConstraint>;
};

export type SolverStack<T> = OutputProducer<T> & OutputSink<T>;
export type SolverPair<A, B> = { readonly left: A; readonly right: B };

export type ConstraintChain<TDomain, TVerbs extends readonly string[], TState extends ReadonlyArray<string> = []> =
  TVerbs extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? ConstraintChain<TDomain, Tail extends readonly string[] ? Tail : never, readonly [...TState, Head]>
      : TState
    : {
        readonly domain: TDomain;
        readonly trace: TState;
        readonly signature: `${TState['length']}-${TDomain & string}`;
      };

export type ConstrainChain<TDomain, TVerbs extends readonly string[], TState extends ReadonlyArray<string> = []> = ConstraintChain<
  TDomain,
  TVerbs,
  TState
>;

export const buildConstraintChain = <TDomain extends string, TVerbs extends readonly string[]>(
  domain: TDomain,
  verbs: TVerbs,
): ConstraintChain<TDomain, TVerbs> => {
  const trace = verbs
    .slice(0, 32)
    .map((verb) => `${verb}`) as ConstraintChain<TDomain, TVerbs>['trace'];
  return {
    domain,
    trace,
    signature: `${verbs.length}-${domain}`,
  } as ConstraintChain<TDomain, TVerbs>;
};

export const solveWithConstraint = async <TDomain extends string, TVerbs extends readonly string[]>(
  domain: TDomain,
  verbs: NoInfer<TVerbs>,
): Promise<{
  readonly domain: TDomain;
  readonly chain: ConstraintChain<TDomain, TVerbs>;
  readonly constraints: SolverConstraint<Record<TVerbs[number], TDomain>>;
}> => {
  const hasAsyncDisposable = typeof globalThis === 'object' && 'AsyncDisposableStack' in globalThis;
  if (hasAsyncDisposable) {
    const StackCtor = globalThis as unknown as { AsyncDisposableStack: new () => { [Symbol.asyncDispose](): Promise<void> } };
    await using stack = new StackCtor.AsyncDisposableStack();
    void stack;
  } else {
    const StackCtor = globalThis as unknown as { DisposableStack: new () => { [Symbol.dispose](): void } };
    using stack = new StackCtor.DisposableStack();
    void stack;
  }

  const chain = buildConstraintChain(domain, verbs);
  const baseline = solverConstraintLattice<Record<TVerbs[number], TDomain>, SolverConstraint<Record<TVerbs[number], TDomain>>>(
    verbs[0] ?? ('discover' as never),
    domain,
    5,
  );
  return { domain, chain, constraints: baseline };
};

export const solverMatrix = solveWithConstraint('auth', ['discover', 'assess', 'notify', 'archive', 'simulate']);
