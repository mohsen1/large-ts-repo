export type SolverVerb =
  | 'analyze'
  | 'collect'
  | 'compose'
  | 'dispatch'
  | 'emit'
  | 'extract'
  | 'fuse'
  | 'join'
  | 'normalize'
  | 'observe'
  | 'publish'
  | 'quantize'
  | 'route'
  | 'safeguard'
  | 'serialize'
  | 'synthesize'
  | 'transform'
  | 'verify';

export interface SolverProfile {
  readonly label: string;
  readonly phase: 'draft' | 'commit' | 'apply';
  readonly retries: number;
  readonly limit: number;
}

export type SolverProfileRecord = {
  readonly analyze: { readonly label: 'analysis'; readonly steps: 6 };
  readonly collect: { readonly label: 'collect'; readonly steps: 4 };
  readonly compose: { readonly label: 'compose'; readonly steps: 8 };
  readonly dispatch: { readonly label: 'dispatch'; readonly steps: 2 };
  readonly emit: { readonly label: 'emit'; readonly steps: 3 };
  readonly extract: { readonly label: 'extract'; readonly steps: 3 };
  readonly fuse: { readonly label: 'fuse'; readonly steps: 6 };
  readonly join: { readonly label: 'join'; readonly steps: 4 };
  readonly normalize: { readonly label: 'normalize'; readonly steps: 8 };
  readonly observe: { readonly label: 'observe'; readonly steps: 1 };
  readonly publish: { readonly label: 'publish'; readonly steps: 4 };
  readonly quantize: { readonly label: 'quantize'; readonly steps: 7 };
  readonly route: { readonly label: 'route'; readonly steps: 3 };
  readonly safeguard: { readonly label: 'safeguard'; readonly steps: 5 };
  readonly serialize: { readonly label: 'serialize'; readonly steps: 3 };
  readonly synthesize: { readonly label: 'synthesize'; readonly steps: 10 };
  readonly transform: { readonly label: 'transform'; readonly steps: 7 };
  readonly verify: { readonly label: 'verify'; readonly steps: 4 };
};

export const solverProfileByVerb: SolverProfileRecord = {
  analyze: { label: 'analysis', steps: 6 },
  collect: { label: 'collect', steps: 4 },
  compose: { label: 'compose', steps: 8 },
  dispatch: { label: 'dispatch', steps: 2 },
  emit: { label: 'emit', steps: 3 },
  extract: { label: 'extract', steps: 3 },
  fuse: { label: 'fuse', steps: 6 },
  join: { label: 'join', steps: 4 },
  normalize: { label: 'normalize', steps: 8 },
  observe: { label: 'observe', steps: 1 },
  publish: { label: 'publish', steps: 4 },
  quantize: { label: 'quantize', steps: 7 },
  route: { label: 'route', steps: 3 },
  safeguard: { label: 'safeguard', steps: 5 },
  serialize: { label: 'serialize', steps: 3 },
  synthesize: { label: 'synthesize', steps: 10 },
  transform: { label: 'transform', steps: 7 },
  verify: { label: 'verify', steps: 4 },
} as const;

export type SolverProfileByVerb<V extends SolverVerb> = SolverProfileRecord[V];

export type VerbIndex<V extends SolverVerb> =
  V extends 'analyze' ? 0
  : V extends 'collect' ? 1
  : V extends 'compose' ? 2
  : V extends 'dispatch' ? 3
  : V extends 'emit' ? 4
  : V extends 'extract' ? 5
  : V extends 'fuse' ? 6
  : V extends 'join' ? 7
  : V extends 'normalize' ? 8
  : V extends 'observe' ? 9
  : V extends 'publish' ? 10
  : V extends 'quantize' ? 11
  : V extends 'route' ? 12
  : V extends 'safeguard' ? 13
  : V extends 'serialize' ? 14
  : V extends 'synthesize' ? 15
  : V extends 'transform' ? 16
  : 17;

export type IsApplySafe<V extends SolverVerb> =
  VerbIndex<V> extends 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 ? true : false;

export type SolverEnvelope<V extends SolverVerb> = {
  readonly verb: V;
  readonly profile: SolverProfile;
  readonly valid: IsApplySafe<V>;
};

export type SolverChain<T extends readonly SolverVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends SolverVerb
      ? Tail extends readonly SolverVerb[]
        ? {
            readonly head: SolverEnvelope<Head>;
            readonly tail: SolverChain<Tail>;
          }
        : never
      : never
    : { readonly head: never; readonly tail: never };

export type SolverDispatch<T extends readonly SolverVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends SolverVerb
      ? Tail extends readonly SolverVerb[]
        ? {
            readonly label: `dispatch-${Head}`;
            readonly profile: SolverProfileByVerb<Head>;
            readonly next: SolverDispatch<Tail>;
          }
        : never
      : never
    : { readonly done: true };

export type SolverMatrix<T extends readonly SolverVerb[]> = {
  [K in keyof T]: SolverProfileByVerb<T[K] & SolverVerb>;
};

export type BuildTuple<N extends number, T extends unknown[] = []> =
  T['length'] extends N ? T : BuildTuple<N, [...T, { readonly index: T['length']; readonly label: `s-${T['length']}` }] >;

export type DeepMergeConfig<T extends readonly SolverVerb[]> = {
  readonly verbs: T;
  readonly tuple: BuildTuple<12>;
  readonly matrix: SolverMatrix<T>;
};

export type ConstrainedUnion<T extends readonly SolverVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends SolverVerb
      ? Tail extends readonly SolverVerb[]
        ? {
            readonly head: Head;
            readonly config: SolverProfileByVerb<Head>;
            readonly rest: ConstrainedUnion<Tail>;
          }
        : never
      : never
    : { readonly done: true };

export type NoInfer<T> = T & { readonly __no_infer: T };

export type ChainResolver<
  A extends SolverVerb,
  B extends SolverVerb,
  C extends readonly SolverVerb[] = []
> = A extends C[number]
  ? false
  : B extends 'analyze' | 'collect' | 'compose' | 'verify'
    ? C['length'] extends 16
      ? true
      : ChainResolver<B, A, [...C, A]>
    : true;

export const solverTemplates = [
  'analyze',
  'collect',
  'compose',
  'dispatch',
  'emit',
  'extract',
  'fuse',
  'join',
  'normalize',
  'observe',
  'publish',
  'quantize',
  'route',
  'safeguard',
  'serialize',
  'synthesize',
  'transform',
  'verify',
] as const satisfies readonly SolverVerb[];

export const solverProfileSet = (verb: SolverVerb): SolverEnvelope<typeof verb> => ({
  verb,
  profile: {
    label: solverProfileByVerb[verb].label,
    phase: 'draft',
    retries: 3,
    limit: 128,
  },
  valid: true,
});

export const buildSolverGraph = <T extends readonly SolverVerb[]>(verbs: T) => {
  const route = [] as Array<{ label: string; verb: SolverVerb }>;
  let index = 0;
  for (const verb of verbs) {
    route.push({
      label: solverProfileByVerb[verb].label,
      verb,
    });
    index += 1;
    if (index > 32) {
      break;
    }
  }

  const result = {
    verbs,
    tuple: route.map((_step, offset) => ({ index: offset, label: `s-${offset}` })) as BuildTuple<12>,
    matrix: verbs.map((verb) => solverProfileByVerb[verb]) as unknown as SolverMatrix<T>,
  } as DeepMergeConfig<T>;
  return result;
};

export function buildSolverChain<T extends readonly SolverVerb[]>(verbs: T): SolverChain<T> {
  const [head, ...tail] = verbs;
  if (!head) {
    return { head: undefined as never, tail: undefined as never } as SolverChain<T>;
  }
  return {
    head: solverProfileSet(head as SolverVerb),
    tail: buildSolverChain(tail),
  } as unknown as SolverChain<T>;
}

export function dispatchSolverChain<T extends readonly SolverVerb[]>(verbs: T): SolverDispatch<T> {
  const [head, ...tail] = verbs;
  if (!head) {
    return { done: true } as SolverDispatch<T>;
  }
  return {
    label: `dispatch-${head}`,
    profile: solverProfileByVerb[head as SolverVerb],
    next: dispatchSolverChain(tail),
  } as unknown as SolverDispatch<T>;
}

export const solverUnion = {
  analyze: solverProfileSet('analyze'),
  collect: solverProfileSet('collect'),
  compose: solverProfileSet('compose'),
  dispatch: solverProfileSet('dispatch'),
  emit: solverProfileSet('emit'),
  extract: solverProfileSet('extract'),
  fuse: solverProfileSet('fuse'),
  join: solverProfileSet('join'),
  normalize: solverProfileSet('normalize'),
  observe: solverProfileSet('observe'),
  publish: solverProfileSet('publish'),
  quantize: solverProfileSet('quantize'),
  route: solverProfileSet('route'),
  safeguard: solverProfileSet('safeguard'),
  serialize: solverProfileSet('serialize'),
  synthesize: solverProfileSet('synthesize'),
  transform: solverProfileSet('transform'),
  verify: solverProfileSet('verify'),
} as const;

export const evaluateSolverCompatibility = <A extends SolverVerb, B extends SolverVerb>(
  from: A,
  to: B,
): boolean =>
  (from === 'analyze' && to !== 'analyze') ||
  (from === 'collect' && (to === 'compose' || to === 'extract')) ||
  (from === 'compose' && (to === 'fuse' || to === 'transform')) ||
  (from === 'dispatch' && (to === 'publish' || to === 'emit')) ||
  (from === 'verify' && to === 'collect') ||
  false;

export function makeSolverResult<T extends readonly SolverVerb[]>(verbs: T) {
  const matrix = verbs.map((verb, index) => ({
    verb,
    index,
    profile: solverProfileByVerb[verb as SolverVerb].label,
    resolved: true,
  }));
  return {
    matrix,
    count: matrix.length,
    chain: buildSolverChain(verbs),
    dispatch: dispatchSolverChain(verbs),
  };
}

export function createSolverInvocationMatrix<T extends readonly SolverVerb[]>(verbs: T) {
  return {
    matrix: verbs,
    chain: buildSolverChain(verbs),
    dispatch: dispatchSolverChain(verbs),
  payload: verbs.reduce((acc, verb, index) => ({
    ...acc,
      [verb]: {
        step: index,
        profile: solverProfileByVerb[verb as SolverVerb],
      },
    }), {} as { [K in T[number]]: { step: number; profile: SolverProfileByVerb<K> } }),
  };
}

export type SolverInstance<T extends readonly SolverVerb[]> = {
  readonly solver: 'generic';
  readonly verbs: T;
  readonly constraints: ConstrainedUnion<T>;
};

export function createSolverInstance<T extends readonly SolverVerb[]>(verbs: T): SolverInstance<T> {
  return {
    solver: 'generic',
    verbs,
    constraints: buildConstraints(verbs),
  };
}

export function buildConstraints<T extends readonly SolverVerb[]>(verbs: T): ConstrainedUnion<T> {
  return [] as unknown as ConstrainedUnion<T>;
}

export type SolverBrand = `Solver-${string}`;
export type BrandedSolverResult<T extends SolverVerb> = {
  readonly __tag: SolverBrand;
  readonly verb: T;
};

export const brandSolverResult = <T extends SolverVerb>(result: SolverProfileByVerb<T>): BrandedSolverResult<T> => ({
  __tag: `Solver-${result.label}` as SolverBrand,
  verb: Object.keys(solverUnion)[0] as T,
});

export type SolverOverloadFactory = {
  <T extends SolverVerb>(verb: T): SolverEnvelope<T>;
  <T extends SolverVerb, U extends SolverVerb>(first: T, second: U): { readonly first: SolverEnvelope<T>; readonly second: SolverEnvelope<U> };
  <T extends readonly SolverVerb[]>(verbs: [...T]): SolverInstance<T>;
};

export const makeSolver: SolverOverloadFactory = ((arg1: SolverVerb | readonly SolverVerb[], arg2?: SolverVerb) => {
  if (Array.isArray(arg1)) {
    return createSolverInstance(arg1 as any) as never;
  }
  if (typeof arg2 === 'string') {
    return {
      first: solverProfileSet(arg1 as SolverVerb),
      second: solverProfileSet(arg2),
    } as never;
  }
  return solverProfileSet(arg1 as SolverVerb) as never;
}) as SolverOverloadFactory;

export const solverMatrix = {
  dense: createSolverInvocationMatrix(solverTemplates as any),
  compact: createSolverInvocationMatrix(solverTemplates.slice(0, 10) as any),
  wide: createSolverInvocationMatrix(solverTemplates.slice(0, 15) as any),
  constrained: createSolverInvocationMatrix(solverTemplates.slice(0, 18) as any),
};

export const solverProfiles = solverTemplates.map((verb) => ({
  verb,
  profile: solverProfileByVerb[verb],
  index: solveIndex(verb),
  ready: evaluateSolverCompatibility(verb, 'verify'),
}));

const solveIndex = (verb: SolverVerb): number =>
  verb === 'analyze'
    ? 0
    : verb === 'collect'
      ? 1
      : verb === 'compose'
        ? 2
        : verb === 'dispatch'
          ? 3
          : verb === 'emit'
            ? 4
            : verb === 'extract'
              ? 5
              : verb === 'fuse'
                ? 6
                : verb === 'join'
                  ? 7
                  : verb === 'normalize'
                    ? 8
                    : verb === 'observe'
                      ? 9
                      : verb === 'publish'
                        ? 10
                        : verb === 'quantize'
                          ? 11
                          : verb === 'route'
                            ? 12
                            : verb === 'safeguard'
                              ? 13
                              : verb === 'serialize'
                                ? 14
                                : verb === 'synthesize'
                                  ? 15
                                  : verb === 'transform'
                                    ? 16
                                    : 17;

export const runSolver = (input: ReadonlyArray<SolverVerb>) => {
  const output = input.slice(0, 18);
  return {
    accepted: output.length,
    dispatch: dispatchSolverChain(output as readonly SolverVerb[]),
    chain: buildSolverChain(output as readonly SolverVerb[]),
  };
};
