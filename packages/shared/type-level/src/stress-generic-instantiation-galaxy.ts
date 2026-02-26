export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type ConstraintNode<
  TName extends string,
  TPayload,
  TMeta extends Record<string, unknown>,
> = {
  readonly name: TName;
  readonly payload: TPayload;
  readonly meta: TMeta;
};

export type SolverConfig<
  TContext,
  TInput extends Record<string, unknown>,
  TConstraint extends ConstraintNode<string, TInput, Record<string, unknown>>,
> = Readonly<{
  readonly context: TContext;
  readonly input: TConstraint['payload'];
  readonly metadata: TConstraint['meta'];
}>;

export interface SolverOutput<T extends string, TPayload, TTag extends string> {
  readonly namespace: T;
  readonly payload: TPayload;
  readonly tag: TTag;
  readonly timestamp: string;
}

export interface PluginFactory<
  TContext,
  TInput extends Record<string, unknown>,
  TOutput,
> {
  readonly key: `factory-${string}`;
  create(input: TInput, context: TContext): Promise<TOutput>;
  dispose?(): void;
}

export type InferOutput<T> = T extends PluginFactory<infer _Context, infer _Input, infer Output> ? Output : never;
export type InferInput<T> = T extends PluginFactory<infer _Context, infer Input, infer _Output> ? Input : never;

export type Interlock<
  TConstraint extends ConstraintNode<string, unknown, Record<string, unknown>>,
  TOutput extends Record<string, unknown>,
> = {
  readonly constraint: TConstraint;
  readonly result: TOutput;
  readonly score: number;
};

export type SolverConstraint<TInput extends Record<string, unknown>> =
  ConstraintNode<string, TInput, Record<string, unknown>>;

export type InterlockedFactoryOutput<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> = Interlock<SolverConstraint<TInput>, TOutput>;

export const instantiateFactory = <
  TContext,
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(
  factory: PluginFactory<TContext, TInput, TOutput>,
  input: NoInfer<TInput>,
  context: TContext,
): Promise<SolverConfig<TContext, TInput, SolverConstraint<TInput>>> => {
  return Promise.resolve({
    context,
    input,
    metadata: {
      createdBy: factory.key,
      constraints: ['factory'],
    },
  });
};

export function runFactory<TContext, TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  factory: PluginFactory<TContext, TInput, TOutput>,
  input: TInput,
  context: TContext,
): Promise<InterlockedFactoryOutput<TInput, TOutput>>;

export function runFactory<TContext, TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  factory: PluginFactory<TContext, TInput, TOutput>,
  input: TInput,
  context: TContext,
  override: { readonly dryRun: true },
): Promise<InterlockedFactoryOutput<TInput, TOutput>>;

export function runFactory<TContext, TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  factory: PluginFactory<TContext, TInput, TOutput>,
  input: TInput,
  context: TContext,
  override?: { readonly dryRun?: boolean },
): Promise<InterlockedFactoryOutput<TInput, TOutput>> {
  const constraint = {
    name: factory.key,
    payload: input,
    meta: {
      createdBy: factory.key,
      mode: override?.dryRun ? 'dry' : 'live',
      score: override?.dryRun ? 1 : 10,
    },
  } as SolverConstraint<TInput>;

  const baseOutput: InterlockedFactoryOutput<TInput, TOutput> = {
    constraint: {
      ...constraint,
      meta: {
        createdBy: constraint.meta.createdBy,
        mode: constraint.meta.mode,
      },
    },
    result: {} as TOutput,
    score: override?.dryRun ? 1 : 10,
  };

  return Promise.resolve(baseOutput);
}

type FactoryChainConstraint = Interlock<
  ConstraintNode<'factory-chain', Record<string, unknown>, Record<string, unknown>>,
  Record<string, unknown>
>;

type FactoryChainFactory = PluginFactory<
  FactoryChainConstraint,
  Record<string, unknown>,
  Record<string, unknown>
>;

export function createChain<
  T extends readonly FactoryChainFactory[],
  N extends number = 4,
>(
  factories: T,
): readonly FactoryChainFactory[];

export function createChain<
  T extends readonly FactoryChainFactory[],
  N extends number,
>(
  factories: T,
  _depth: N,
  _label: string,
): readonly FactoryChainFactory[];

export function createChain<
  T extends readonly FactoryChainFactory[],
>(
  factories: T,
  _depth?: number,
  _label?: string,
): readonly FactoryChainFactory[] {
  return factories as readonly FactoryChainFactory[];
}

export const runFactorySet = <
  TFactory extends readonly FactoryChainFactory[],
  TContext,
>(
  factories: TFactory,
  context: TContext,
): readonly Promise<{
  readonly output: InferOutput<TFactory[number]>;
  readonly input: InferInput<TFactory[number]>;
}>[] => {
  return factories.map(async (factory) => {
    const output = await runFactory(factory as never, {} as never, context as never, { dryRun: true });
    return {
      output: output.result as InferOutput<TFactory[number]>,
      input: output.constraint.payload as InferInput<TFactory[number]>,
    };
  });
};

export type ChainInvocationRecord<
  TContext,
  TFactories extends readonly FactoryChainFactory[],
> = {
  readonly context: TContext;
  readonly chain: TFactories;
  readonly outputs: readonly Promise<{
    readonly output: InferOutput<TFactories[number]>;
    readonly input: InferInput<TFactories[number]>;
  }>[];
};

export const chainRegistry = <
  TContext,
  TFactories extends readonly FactoryChainFactory[],
>(
  context: TContext,
  chain: TFactories,
): ChainInvocationRecord<TContext, TFactories> => {
  return {
    context,
    chain,
    outputs: runFactorySet(chain, context),
  };
};
