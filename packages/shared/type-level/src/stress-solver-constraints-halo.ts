import type { NoInfer } from './patterns';

export type BrandMarker<T, Tag extends string> = T & { readonly __tag: Tag };

export type SolverInput = {
  readonly kind: 'read' | 'write' | 'compute';
  readonly namespace: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: {
    readonly tags: readonly string[];
    readonly correlationId: string;
  };
};

export interface SolverConstraint<T extends SolverInput> {
  readonly signature: `${T['kind']}:${T['namespace']}`;
  readonly requires: readonly string[];
  readonly accepts: T;
}

export type ConstraintOfKind<T extends SolverInput, K extends T['kind']> = Extract<T, { readonly kind: K }>;
export type ConstraintInput<T extends SolverInput> = ConstraintOfKind<T, T['kind']>;

export type ResolveSolverConstraint<T extends SolverInput> = T extends { readonly kind: 'read' }
  ? { readonly mode: 'R'; readonly readonlyPayload: Readonly<T['payload']> }
  : T extends { readonly kind: 'write' }
    ? { readonly mode: 'W'; readonly lock: true }
    : T extends { readonly kind: 'compute' }
      ? { readonly mode: 'C'; readonly estimateMs: number }
      : never;

export type SolverRoute<T extends SolverInput> = {
  readonly namespace: T['namespace'];
  readonly kind: T['kind'];
  readonly constraints: ResolveSolverConstraint<T>;
  readonly checksum: `${T['kind']}_${T['namespace']}_payload`;
};

export type Solve<T extends SolverInput, C extends SolverConstraint<T> = SolverConstraint<T>> = T['kind'] extends C['accepts']['kind']
  ? { readonly success: true; readonly route: SolverRoute<T>; readonly result: C }
  : { readonly success: false; readonly issue: 'constraint_mismatch' };

export type ResolvePair<A extends SolverInput, B extends SolverInput> = A extends { readonly namespace: infer N }
  ? B extends { readonly namespace: N }
    ? [SolverRoute<A>, SolverRoute<B>]
    : never
  : never;

export type DeepConstraint<T extends readonly SolverInput[]> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends SolverInput
    ? { readonly head: ConstraintInput<Head>; readonly tail: DeepConstraint<Rest extends readonly SolverInput[] ? Rest : never> }
    : never
  : { readonly head: never; readonly tail: never };

export type SolverFactoryOutput<T extends SolverInput, C extends SolverConstraint<T>> = {
  in: (input: T, constraint: NoInfer<C>) => Solve<T, C>;
  out: (input: T, key: T['namespace']) => BrandMarker<T['namespace'], 'output'>;
};

export interface SolverRuntime<Input extends SolverInput, Constraint extends SolverConstraint<Input>> {
  readonly id: BrandMarker<Input['namespace'], 'runtime-id'>;
  readonly run: (input: Input, override: NoInfer<Constraint>) => Solve<Input, Constraint>;
  readonly inspect: (input: Input) => SolverRoute<Input>;
}

const resolveConstraint = <T extends SolverInput>(input: T): ResolveSolverConstraint<T> => {
  if (input.kind === 'read') {
    return {
      mode: 'R',
      readonlyPayload: Object.freeze({ ...input.payload }) as Readonly<T['payload']>,
    } as ResolveSolverConstraint<T>;
  }
  if (input.kind === 'write') {
    return { mode: 'W', lock: true } as ResolveSolverConstraint<T>;
  }
  return {
    mode: 'C',
    estimateMs: input.metadata.tags.length * 13 + Object.keys(input.payload).length,
  } as ResolveSolverConstraint<T>;
};

const solverRoute = <TInput extends SolverInput>(input: TInput): SolverRoute<TInput> => ({
  namespace: input.namespace,
  kind: input.kind,
  constraints: resolveConstraint(input),
  checksum: `${input.kind}_${input.namespace}_payload` as const,
});

export const createRuntime = <
  Input extends SolverInput,
  Constraint extends SolverConstraint<Input> = SolverConstraint<Input>,
>(id: string): SolverRuntime<Input, Constraint> => {
  return {
    id: `runtime:${id}` as BrandMarker<Input['namespace'], 'runtime-id'>,
    run: (input, override) => ({
      success: true,
      route: solverRoute(input),
      result: override as Constraint,
    }) as Solve<Input, Constraint>,
    inspect: (input) => solverRoute(input),
  };
};

export const solveOne = <T extends SolverInput, C extends SolverConstraint<T>>(
  input: T,
  constraint: NoInfer<C>,
): Solve<T, C> => {
  return {
    success: true,
    route: solverRoute(input),
    result: constraint,
  } as Solve<T, C>;
};

export const solveAll = <const T extends readonly SolverInput[]>(
  inputs: T,
  constraints: { [K in keyof T]: NoInfer<SolverConstraint<T[K]>> },
): DeepConstraint<T> => {
  const out: DeepConstraint<T> = inputs.reduce<DeepConstraint<T>>((acc, current, index) => {
    if (index === 0) {
      return {
        head: current as ConstraintInput<T[number]>,
        tail: { head: null as never, tail: null as never },
      } as DeepConstraint<T>;
    }
    return acc;
  }, {
    head: inputs[0] as ConstraintInput<T[number]>,
    tail: { head: null as never, tail: null as never },
  } as DeepConstraint<T>);
  void constraints;
  return out;
};

export const solveFactory = <Inputs extends readonly SolverInput[]>(inputs: Inputs) => {
  return inputs.map((input) => {
    const constraint: SolverConstraint<Inputs[number]> = {
      signature: `${input.kind}:${input.namespace}`,
      requires: input.metadata.tags,
      accepts: input as Inputs[number],
    };
    const runtime = createRuntime<Inputs[number], SolverConstraint<Inputs[number]>>(`${input.kind}:${input.namespace}`);
    const output = runtime;
    return {
      in: (payload, runtimeConstraint) =>
        runtime.run(payload, runtimeConstraint as never) as Solve<Inputs[number], SolverConstraint<Inputs[number]>>,
      out: (_payload, key) => `${key}:ok` as BrandMarker<Inputs[number]['namespace'], 'output'>,
    };
  }) as {
    readonly [K in keyof Inputs]: SolverFactoryOutput<Inputs[K], SolverConstraint<Inputs[K]>>;
  };
};

export type SolverMatrix<T extends readonly SolverInput[]> = {
  readonly index: ResolvePair<T[number], T[number]>[];
  readonly runtime: SolverRuntime<T[number], SolverConstraint<T[number]>>;
};

export const buildSolverMatrix = <const T extends readonly SolverInput[]>(items: T): SolverMatrix<T> => {
  const pairs: SolverMatrix<T>['index'] = [];
  for (const source of items) {
    for (const sink of items) {
      if (source.namespace === sink.namespace) {
        pairs.push([solverRoute(source), solverRoute(sink)] as ResolvePair<T[number], T[number]>);
      }
    }
  }

  const seed = items[0];
  const runtime = createRuntime<T[number], SolverConstraint<T[number]>>(
    `${seed?.kind ?? 'read'}:${seed?.namespace ?? 'global'}`,
  );
  return {
    index: pairs,
    runtime,
  };
};
