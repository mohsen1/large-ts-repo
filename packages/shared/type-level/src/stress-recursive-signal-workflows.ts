export type BuildTuple<Length extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends Length
  ? Acc
  : BuildTuple<Length, readonly [...Acc, unknown]>;

export type Decrement<Length extends number> = BuildTuple<Length> extends readonly [unknown, ...infer Rest]
  ? Rest['length']
  : 0;

export type Add<A extends number, B extends number> = [...BuildTuple<A>, ...BuildTuple<B>]['length'];

export type SignalState = {
  readonly token: string;
  readonly index: number;
  readonly stage: number;
};

export type SignalUnion =
  | 'observe'
  | 'disambiguate'
  | 'evaluate'
  | 'transform'
  | 'emit'
  | 'ack'
  | 'reject'
  | 'escalate'
  | 'verify'
  | 'restore';

export type SignalProfile<T extends SignalUnion> = {
  readonly id: `signal-${T}`;
  readonly route: T;
  readonly weight: T['length'];
};

export type SignalSequence = [
  SignalProfile<'observe'>,
  SignalProfile<'disambiguate'>,
  SignalProfile<'evaluate'>,
  SignalProfile<'transform'>,
  SignalProfile<'emit'>,
  SignalProfile<'ack'>,
  SignalProfile<'reject'>,
  SignalProfile<'escalate'>,
  SignalProfile<'verify'>,
  SignalProfile<'restore'>,
];

export type NextSignal<T extends SignalUnion> = T extends 'observe'
  ? 'disambiguate'
  : T extends 'disambiguate'
    ? 'evaluate'
    : T extends 'evaluate'
      ? 'transform'
      : T extends 'transform'
        ? 'emit'
        : T extends 'emit'
          ? 'ack'
          : T extends 'ack'
            ? 'reject'
            : T extends 'reject'
              ? 'escalate'
              : T extends 'escalate'
                ? 'verify'
                : T extends 'verify'
                  ? 'restore'
                  : 'restore';

export type SignalStateBranch<T extends SignalUnion, Depth extends number> = Depth extends 0
  ? { readonly stage: T; readonly next?: undefined }
  : { readonly stage: T; readonly next: SignalStateBranch<NextSignal<T>, Decrement<Depth>> };

export type NormalizeFlow<T> = T extends { readonly stage: infer S; readonly next: infer N }
  ? N extends { readonly stage: infer _ }
    ? readonly [S & string, ...NormalizeFlow<N>]
    : readonly [S & string]
  : readonly [];

export type FlowCatalog<Depth extends number> = SignalStateBranch<'observe', Depth>;

export type RecursiveEnvelope<T, Depth extends number> = Depth extends 0
  ? { readonly done: T }
  : { readonly kind: 'A'; readonly payload: T; readonly depth: Depth; readonly next: RecursiveEnvelope<T, Decrement<Depth>> };

export type WrapShape<T, Depth extends number> = Depth extends 0
  ? { readonly depth: 0; readonly payload: T }
  : { readonly depth: Depth; readonly payload: T; readonly next: WrapShape<T, Decrement<Depth>> };

export type UnwrapShape<T> = T extends { readonly payload: infer Payload; readonly next: infer Next }
  ? [Payload, ...UnwrapShape<Next>]
  : T extends { readonly payload: infer Payload }
    ? [Payload]
    : [];

export interface SolverToken {
  readonly key: string;
  readonly score: number;
}

export type SolverNode<T extends string, Depth extends number> = {
  readonly name: T;
  readonly score: Add<Depth, 1>;
  readonly nodes: readonly [SolverToken, ...UnwrapShape<WrapShape<SolverToken, Depth>>];
};

export type BuildSolverTree<TName extends string, Depth extends number> = {
  readonly name: TName;
  readonly root: WrapShape<{ readonly value: TName }, Depth>;
  readonly flatten: UnwrapShape<WrapShape<{ readonly value: TName }, Depth>>;
  readonly flow: FlowCatalog<Depth>;
  readonly normalized: NormalizeFlow<FlowCatalog<Depth>>;
  readonly recursive: RecursiveEnvelope<TName, Depth>;
  readonly solver: SolverNode<TName, Depth>;
};

export type BuildSolverStack<TName extends string, Depth extends 4 | 8 | 16> = BuildSolverTree<TName, Depth>;

export const signalIndex: Record<SignalUnion, number> = {
  observe: 0,
  disambiguate: 1,
  evaluate: 2,
  transform: 3,
  emit: 4,
  ack: 5,
  reject: 6,
  escalate: 7,
  verify: 8,
  restore: 9,
} as const;

export const sequenceCatalog: readonly SignalUnion[] = [
  'observe',
  'disambiguate',
  'evaluate',
  'transform',
  'emit',
  'ack',
  'reject',
  'escalate',
  'verify',
  'restore',
] as const;

type SignalRuntimeMap = Record<SignalUnion, SignalUnion>;

const nextSignalRuntime: SignalRuntimeMap = {
  observe: 'disambiguate',
  disambiguate: 'evaluate',
  evaluate: 'transform',
  transform: 'emit',
  emit: 'ack',
  ack: 'reject',
  reject: 'escalate',
  escalate: 'verify',
  verify: 'restore',
  restore: 'restore',
} as const;

const makeFlowChain = (seed: SignalUnion, depth: number): SignalStateBranch<SignalUnion, number> => {
  const make = (value: SignalUnion, remaining: number): SignalStateBranch<SignalUnion, number> => {
    if (remaining <= 0) {
      return { stage: value } as unknown as SignalStateBranch<SignalUnion, number>;
    }
    return {
      stage: value,
      next: make(nextSignalRuntime[value], remaining - 1),
    } as unknown as SignalStateBranch<SignalUnion, number>;
  };

  return make(seed, depth) as unknown as SignalStateBranch<SignalUnion, number>;
};

const makeRecursive = <TValue extends string, TDepth extends number>(
  value: TValue,
  depth: TDepth,
): RecursiveEnvelope<TValue, TDepth> => {
  if (depth <= 0) {
    return { done: value } as unknown as RecursiveEnvelope<TValue, TDepth>;
  }
  return {
    kind: 'A',
    payload: value,
    depth,
    next: makeRecursive(value, (depth - 1) as TDepth),
  } as unknown as RecursiveEnvelope<TValue, TDepth>;
};

const makeWrap = <TValue, TDepth extends number>(value: TValue, depth: TDepth): WrapShape<TValue, TDepth> => {
  if (depth <= 0) {
    return { depth: 0, payload: value } as unknown as WrapShape<TValue, TDepth>;
  }

  return {
    depth,
    payload: value,
    next: makeWrap(value, (depth - 1) as TDepth),
  } as unknown as WrapShape<TValue, TDepth>;
};

export const toFlow = <Depth extends 4 | 8 | 16>(depth: Depth): FlowCatalog<Depth> =>
  makeFlowChain('observe', depth) as FlowCatalog<Depth>;

export const wrapFlow = <T extends SignalUnion>(seed: T): WrapShape<{ readonly signal: T }, 8> =>
  makeWrap({ signal: seed }, 8);

export const makeSolverTree = <TName extends string, Depth extends 4 | 8 | 16>(name: TName, depth: Depth): BuildSolverTree<TName, Depth> => {
  const root = makeWrap({ value: name }, depth);
  const recursive = makeRecursive(name, depth);
  const normalized = Array.from({ length: signalIndex.observe + 1 }, (_, index) => ({ index, token: `${name}:${index}` })) as unknown as SignalStateBranch<SignalUnion, Depth>;
  const nodes = [
    { key: `${name}:0`, score: 0 },
    { key: `${name}:1`, score: 1 },
    { key: `${name}:2`, score: 2 },
    { key: `${name}:3`, score: 3 },
  ] as unknown as SolverNode<TName, Depth>['nodes'];

  return {
    name,
    root,
    flatten: [{ value: name }] as UnwrapShape<WrapShape<{ readonly value: TName }, Depth>>,
    flow: toFlow(depth),
    normalized: ['observe', ...sequenceCatalog] as unknown as NormalizeFlow<FlowCatalog<Depth>>,
    recursive,
    solver: {
      name,
      score: depth as SolverNode<TName, Depth>['score'],
      nodes,
    },
  };
};

export const buildSolverStack = <TName extends string, Depth extends 4 | 8 | 16>(
  name: TName,
  depth: Depth,
): BuildSolverStack<TName, Depth> => makeSolverTree(name, depth);

export const rangeCatalog = Array.from({ length: 9 }, (_, value) => value) as unknown as BuildTuple<9>;

export const signalMapEntries = Object.entries(signalIndex).map(([signal, index]) => ({
  signal,
  index,
  rank: nextSignalRuntime[signal as SignalUnion],
}));

export const describeSignalFlow = (seed: SignalUnion, depth: 4 | 8 | 16) => {
  const flow = wrapFlow(seed);
  const tree = makeSolverTree(`flow:${seed}`, depth);
  const flattened = Array.isArray(tree.flatten) ? tree.flatten.length : 0;
  return {
    flow,
    tree: {
      name: tree.name,
      score: tree.solver.score,
      nodes: tree.solver.nodes,
      flatLength: flattened,
    },
  };
};
