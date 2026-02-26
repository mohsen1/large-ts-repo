import type { DeepReadonly, UnionToIntersection } from '@shared/type-level';

export type SolverVerb =
  | 'validate'
  | 'infer'
  | 'resolve'
  | 'merge'
  | 'accumulate'
  | 'dispatch'
  | 'throttle'
  | 'enforce'
  | 'report'
  | 'replay';

export type SolverKind = 'scalar' | 'tuple' | 'union' | 'intersection' | 'mapped' | 'recursive';

export type SolverConstraintSet = {
  readonly solver: SolverKind;
  readonly phase: 'draft' | 'commit' | 'apply';
  readonly retries: number;
  readonly limit: number;
};

export type BrandId<T extends string> = T & { readonly __brand: 'solver-token' };

export interface SolverToken<T extends string> {
  readonly token: BrandId<T>;
  readonly createdAt: string;
}

export type SolverConstraint<T extends SolverVerb, C extends SolverConstraintSet> =
  T extends 'validate'
    ? { readonly kind: 'validate'; readonly input: { required: true } & C; readonly output: { ok: true } }
    : T extends 'infer'
      ? { readonly kind: 'infer'; readonly input: { required: false } & C; readonly output: { inference: true } }
      : T extends 'resolve'
        ? { readonly kind: 'resolve'; readonly input: { required: true } & C; readonly output: { resolved: true } }
        : T extends 'merge'
          ? { readonly kind: 'merge'; readonly input: { required: true } & C; readonly output: { merged: true } }
          : T extends 'accumulate'
            ? { readonly kind: 'accumulate'; readonly input: { required: false } & C; readonly output: { accumulated: true } }
            : T extends 'dispatch'
              ? { readonly kind: 'dispatch'; readonly input: { required: true } & C; readonly output: { dispatched: true } }
              : T extends 'throttle'
                ? { readonly kind: 'throttle'; readonly input: { required: false } & C; readonly output: { throttled: true } }
                : T extends 'enforce'
                  ? { readonly kind: 'enforce'; readonly input: { required: true } & C; readonly output: { enforced: true } }
                  : T extends 'report'
                    ? { readonly kind: 'report'; readonly input: { required: false } & C; readonly output: { reported: true } }
                    : { readonly kind: 'replay'; readonly input: { required: true } & C; readonly output: { replayed: true } };

export type ConstraintInput<T extends SolverVerb> = SolverConstraint<T, DefaultSolverConstraint>['input'];
export type SolverOutput<T extends SolverVerb> = SolverConstraint<T, DefaultSolverConstraint>['output'];

export type SolverVerbTransition<T extends SolverVerb, P extends SolverVerb> =
  T extends 'validate'
    ? P extends 'infer' | 'report' ? true : false
    : T extends 'infer'
      ? P extends 'resolve' | 'merge' | 'accumulate' ? true : false
      : T extends 'resolve'
        ? P extends 'accumulate' | 'dispatch' | 'report' ? true : false
        : T extends 'merge'
          ? P extends 'dispatch' | 'enforce' | 'report' ? true : false
          : T extends 'accumulate'
            ? P extends 'dispatch' | 'resolve' | 'replay' ? true : false
            : T extends 'dispatch'
              ? P extends 'throttle' | 'enforce' ? true : false
              : T extends 'throttle'
                ? P extends 'dispatch' | 'report' ? true : false
                : T extends 'enforce'
                  ? P extends 'report' | 'replay' ? true : false
                  : T extends 'report'
                    ? P extends 'replay' ? true : false
                    : P extends 'validate' ? true : false;

export type SolverPipelineStep<T extends readonly SolverVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends SolverVerb
      ? Tail extends readonly SolverVerb[]
        ? {
            readonly step: Head;
            readonly config: ConstraintInput<Head>;
            readonly next: SolverPipelineStep<Tail>;
          }
        : { readonly done: true }
      : { readonly done: true }
    : { readonly done: true };

export type SolverPipelineResult<T extends readonly SolverVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends SolverVerb
      ? Tail extends readonly SolverVerb[]
        ? [SolverOutput<Head>, ...SolverPipelineResult<Tail>]
        : []
      : []
    : [];

export type SolverConflict<T extends readonly SolverVerb[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends SolverVerb
      ? Tail extends readonly SolverVerb[]
        ? {
            readonly head: Head;
            readonly incompatible:
              | (Head extends 'validate' ? 'replay' : never)
              | (Head extends 'infer' ? 'merge' : never)
              | (Head extends 'dispatch' ? 'resolve' : never)
              | 'none';
            readonly tail: SolverConflict<Tail>;
          }
        : never
      : never
    : { readonly incompatible: 'none' };

export type SolverTuple<N extends number, T extends unknown[] = []> =
  T['length'] extends N ? T : SolverTuple<N, [...T, { readonly slot: T['length']; readonly code: `slot-${T['length']}` }] >;

export type DecreaseIfPossible<N extends number> =
  N extends 0 ? 0
  : N extends 1 ? 0
  : N extends 2 ? 1
  : N extends 3 ? 2
  : N extends 4 ? 3
  : N extends 5 ? 4
  : N extends 6 ? 5
  : N extends 7 ? 6
  : N extends 8 ? 7
  : N extends 9 ? 8
  : N extends 10 ? 9
  : N;

export type SolverDepth<N extends number> =
  N extends 0
    ? DefaultSolverConstraint
    : {
        readonly level: N;
        readonly nested: SolverDepth<DecreaseIfPossible<N>>;
        readonly token: BrandId<`depth-${N}`>;
      };

export type SolverMapByPhase<T extends SolverConstraintSet> =
  T['phase'] extends 'draft'
    ? SolverConstraint<'validate', T> | SolverConstraint<'infer', T>
    : T['phase'] extends 'commit'
      ? SolverConstraint<'merge', T> | SolverConstraint<'dispatch', T>
      : SolverConstraint<'resolve', T> | SolverConstraint<'report', T>;

export type SolverCatalog<T extends readonly SolverConstraintSet[]> = {
  [K in keyof T]: SolverMapByPhase<T[K]>;
};

export type SolverConstraintGraph<T extends readonly SolverVerb[]> = {
  readonly verbs: T;
  readonly route: SolverPipelineStep<T>;
  readonly results: SolverPipelineResult<T>;
  readonly conflicts: SolverConflict<T>;
  readonly snapshots: SolverTuple<4>;
  readonly depth: SolverDepth<5>;
};

export type ConstraintGraph<T extends readonly SolverVerb[]> = SolverConstraintGraph<T>;

export type DefaultSolverConstraint = {
  readonly solver: 'scalar';
  readonly phase: 'draft';
  readonly retries: 3;
  readonly limit: 128;
};

export type SolverRouteState =
  | { readonly kind: 'idle'; readonly phase: 'draft'; readonly pending: readonly [] }
  | { readonly kind: 'active'; readonly phase: 'commit'; readonly pending: readonly ['validate', 'resolve'] }
  | { readonly kind: 'finished'; readonly phase: 'apply'; readonly pending: readonly ['report', 'replay'] };

export type SolverRouteTransition = SolverVerb | 'waiting';

export type SolverMapRecord = {
  readonly [K in SolverVerb]: {
    readonly phase: K extends 'validate' | 'infer' | 'accumulate' | 'throttle' ? 'draft' : K extends 'merge' | 'dispatch' ? 'commit' : 'apply';
    readonly token: BrandId<K>;
    readonly constraint: SolverConstraint<K, DefaultSolverConstraint>;
  };
};

export const solverRuntimeCatalog = [
  { solver: 'scalar', phase: 'draft', retries: 2, limit: 64 },
  { solver: 'mapped', phase: 'commit', retries: 4, limit: 256 },
  { solver: 'recursive', phase: 'apply', retries: 6, limit: 512 },
] as const satisfies readonly SolverConstraintSet[];

const buildSolverSnapshot = (): SolverTuple<4> => {
  const seed: SolverTuple<4> = [
    { slot: 0, code: 'slot-0' },
    { slot: 1, code: 'slot-1' },
    { slot: 2, code: 'slot-2' },
    { slot: 3, code: 'slot-3' },
  ];
  return seed;
};

const defaultRouteStep = (step: SolverVerb, next?: any): any => ({
  step,
  config: {
    solver: 'scalar',
    phase: step === 'validate' || step === 'infer' || step === 'accumulate' || step === 'throttle'
      ? 'draft'
      : step === 'merge' || step === 'dispatch' || step === 'enforce'
        ? 'commit'
        : 'apply',
    retries: 3,
    limit: 128,
  },
  next,
});

export const buildConstraintGraph = <T extends readonly SolverVerb[]>(verbs: [...T]): ConstraintGraph<T> => {
  const makeDepth = (level: number): SolverDepth<5> => {
    if (level <= 0) {
      return { level: 0, nested: { done: true } as never, token: 'depth-0' as BrandId<'depth-0'> } as any;
    }
    return {
      level,
      token: `depth-${level}` as BrandId<`depth-${number}`>,
      nested: makeDepth(level - 1),
    } as any;
  };

  const recursive = (index: number): SolverPipelineStep<T> => {
    const head = verbs[index] as SolverVerb | undefined;
    if (!head) {
      return { done: true } as SolverPipelineStep<T>;
    }
    const tail = recursive(index + 1);
    return {
      step: head,
      config: {
        solver: 'scalar',
        phase: head === 'validate' || head === 'infer' || head === 'accumulate' || head === 'throttle'
          ? 'draft'
          : head === 'merge' || head === 'dispatch' || head === 'enforce'
            ? 'commit'
            : 'apply',
        retries: 3,
        limit: 128,
      },
      next: tail,
    } as SolverPipelineStep<T>;
  };

  return {
    verbs,
    route: recursive(0),
    results: [] as unknown as SolverPipelineResult<T>,
    conflicts: { incompatible: 'none' } as SolverConflict<T>,
    snapshots: buildSolverSnapshot(),
    depth: makeDepth(5) as SolverDepth<5>,
  };
};

export const emitSolverRoute = (route: SolverRouteState, token: BrandId<string>): string => {
  return `${route.kind}:${route.phase}:${String(token)}`;
};

type SolverDiscriminant<T extends string> = T extends `solver-${infer Kind}-${infer Stage}`
  ? Kind extends SolverKind
    ? Stage extends 'draft' | 'commit' | 'apply'
      ? { readonly kind: Kind; readonly stage: Stage; readonly ready: true }
      : { readonly kind: 'scalar'; readonly stage: 'draft'; readonly ready: false }
    : { readonly kind: 'scalar'; readonly stage: 'draft'; readonly ready: false }
  : { readonly kind: 'scalar'; readonly stage: 'draft'; readonly ready: false };

export const resolveSolverDiscriminant = <T extends string>(raw: T): SolverDiscriminant<T> => {
  const [, kind, stage] = raw.split('-');
  if (kind === 'mapped' || kind === 'scalar' || kind === 'tuple' || kind === 'union' || kind === 'intersection' || kind === 'recursive') {
    return {
      kind: kind as SolverKind,
      stage: (stage as SolverConstraintSet['phase']) ?? 'draft',
      ready: true,
    } as unknown as SolverDiscriminant<T>;
  }
  return {
    kind: 'scalar',
    stage: 'draft',
    ready: false,
  } as unknown as SolverDiscriminant<T>;
}

export const constraintGraphState = (): SolverConstraintGraph<readonly ['validate', 'infer', 'resolve', 'merge', 'dispatch', 'replay']> => ({
  verbs: ['validate', 'infer', 'resolve', 'merge', 'dispatch', 'replay'],
  route: defaultRouteStep('validate', defaultRouteStep('infer', defaultRouteStep('resolve', { done: true }))) as SolverPipelineStep<
    readonly ['validate', 'infer', 'resolve', 'merge', 'dispatch', 'replay']
  >,
  results: [] as unknown as SolverPipelineResult<
    readonly ['validate', 'infer', 'resolve', 'merge', 'dispatch', 'replay']
  >,
  conflicts: { incompatible: 'none' } as SolverConflict<
    readonly ['validate', 'infer', 'resolve', 'merge', 'dispatch', 'replay']
  >,
  snapshots: buildSolverSnapshot(),
  depth: {
    level: 0,
    nested: { done: true } as never,
    token: 'depth-0' as BrandId<'depth-0'>,
  } as unknown as SolverDepth<5>,
} as SolverConstraintGraph<readonly ['validate', 'infer', 'resolve', 'merge', 'dispatch', 'replay']>);

export const collectConstraintGraph = (graph: SolverConstraintGraph<readonly SolverVerb[]>) => {
  return {
    ...graph,
    count: graph.verbs.length,
    conflictCount: graph.conflicts.incompatible ? 0 : 0,
  } as unknown as SolverConstraintGraph<readonly SolverVerb[]> & DeepReadonly<{ readonly count: number; readonly conflictCount: number | string }>;
};

export const buildRuntimeConstraintState = () => ({
  solverId: 'runtime' as BrandId<'runtime'>,
  route: constraintGraphState(),
  deepReadonly: { enabled: true } as DeepReadonly<{ readonly enabled: true }>,
});
