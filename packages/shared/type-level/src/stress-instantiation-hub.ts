export type NoInfer<T> = [T][T extends any ? 0 : never];

export type SolverTag = `solver:${string}`;

export interface SolverInput {
  readonly tenant: string;
  readonly workspace: string;
}

export interface SolverOutput<TOutput> {
  readonly ok: true;
  readonly output: TOutput;
  readonly solvedAt: Date;
}

export interface SolverFailure {
  readonly ok: false;
  readonly code: number;
  readonly reason: string;
}

export type SolverResult<TOutput> = SolverOutput<TOutput> | SolverFailure;

export type SolverContract<TContext extends SolverInput, TInput, TOutput> = {
  readonly tag: SolverTag;
  readonly context: TContext;
  readonly build: (input: TInput) => SolverResult<TOutput>;
};

export type SolverFactory<
  TInput,
  TOutput,
  TContext extends SolverInput = SolverInput,
  TBrand extends string = string,
> = {
  readonly brand: TBrand;
  readonly context: TContext;
  readonly constraints: readonly [SolverTag, ...SolverTag[]];
  readonly invoke: (input: TInput, context: TContext) => SolverResult<TOutput>;
};

export type SolverRegistryEntry = Readonly<{
  readonly key: string;
  readonly tag: SolverTag;
  readonly run: (input: unknown, context: SolverInput) => SolverResult<unknown>;
}>;

export type SolverRegistry = ReadonlyArray<SolverRegistryEntry>;

export type SolverConstraint<TContext extends SolverInput, TInput, TOutput> = SolverContract<TContext, TInput, TOutput>;

export type SolverPipeline<
  TContext extends SolverInput,
  TInput,
  TOutput,
> = SolverContract<TContext, TInput, TOutput> & {
  readonly next: <TNextInput extends SolverInput, TNextOutput>(
    nextSolver: SolverContract<TContext, TInput & TNextInput, TNextOutput>,
  ) => SolverPipeline<TContext, TInput & TNextInput, TNextOutput>;
};

export function registerSolver<TContext extends SolverInput, TInput, TOutput>(
  context: TContext,
  tag: SolverTag,
  build: (input: NoInfer<TInput>, context: TContext) => SolverResult<TOutput>,
): SolverContract<TContext, TInput, TOutput> {
  return {
    tag,
    context,
    build: (input: TInput) => build(input, context),
  };
}

export function createSolverFactory<TContext extends SolverInput, TInput, TOutput>(
  context: TContext,
  brand: `solver:${string}`,
  constraints: readonly [SolverTag, ...SolverTag[]],
  resolve: (input: TInput, context: TContext) => SolverResult<TOutput>,
): SolverFactory<TInput, TOutput, TContext, string> {
  return {
    brand,
    context,
    constraints,
    invoke: (input: TInput, _context: TContext) => resolve(input, context),
  };
}

export function composeSolverPipeline<TContext extends SolverInput, TInput, TOutput>(
  context: TContext,
  first: SolverContract<TContext, TInput, TOutput>,
): SolverPipeline<TContext, TInput, TOutput> {
  const node: SolverPipeline<TContext, TInput, TOutput> = {
    ...first,
    next: <TNextInput extends SolverInput, TNextOutput>(
      nextSolver: SolverContract<TContext, TInput & TNextInput, TNextOutput>,
    ) => {
      const chain: SolverContract<TContext, TInput & TNextInput, TNextOutput> = {
        tag: nextSolver.tag,
        context,
        build: (input: TInput & TNextInput) => {
          const previous = first.build(input as TInput);
          if (!previous.ok) {
            return previous as SolverResult<TNextOutput>;
          }
          return nextSolver.build(input as TInput & TNextInput);
        },
      };

      return composeSolverPipeline(context, chain);
    },
  };

  return node;
}

export function solveMany<TContext extends SolverInput, TInput extends SolverInput>(
  context: TContext,
  solvers: readonly SolverFactory<TInput, unknown, TContext, string>[],
  input: TInput,
): SolverResult<readonly unknown[]> {
  const solved: unknown[] = [];
  for (const solver of solvers) {
    const result = solver.invoke(input, context);
    solved.push(result);
    if (!result.ok) {
      return { ok: false, code: result.code, reason: result.reason };
    }
  }
  return {
    ok: true,
    output: solved,
    solvedAt: new Date(),
  };
};

export const isSolverFailure = (result: SolverResult<unknown>): result is SolverFailure => {
  return result.ok === false;
};

export const solverBrand = (tag: string): SolverTag => `solver:${tag}` as SolverTag;
