export interface InstantiationShape<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
}

export type StageMap<T> = {
  readonly stage: T;
  readonly ready: true;
};

export type StageFactory<TId extends string, TPayload, TOutput, TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  readonly id: TId;
  readonly run: (input: TPayload, context: StageMap<TMeta>) => InstantiationShape<TPayload, TOutput>;
};

export type StageEnvelope<TId extends string, TPayload, TOutput, TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  readonly id: TId;
  readonly payload: TPayload;
  readonly output: TOutput;
  readonly meta: TMeta;
};

export const asFactory = <TId extends string, TPayload, TOutput, TMeta extends Record<string, unknown>>(
  id: TId,
  fn: (input: TPayload, context: StageMap<TMeta>) => TOutput,
): StageFactory<TId, TPayload, TOutput, TMeta> => ({
  id,
  run: (input, context) => ({
    input,
    output: fn(input, context),
  }),
});

export const createStage =
  <TId extends string>(id: TId) =>
  <TPayload, TOutput, TMeta extends Record<string, unknown> = Record<string, unknown>>(
    fn: (input: TPayload, context: StageMap<TMeta>) => TOutput,
  ): StageFactory<TId, TPayload, TOutput, TMeta> =>
    asFactory<TId, TPayload, TOutput, TMeta>(id, fn);

export type StageReducer<TState, TAction> = (state: TState, action: TAction) => TState;

export type StageReducerTuple<
  TState,
  TFactories extends readonly StageFactory<string, unknown, unknown, Record<string, unknown>>[],
> = {
  readonly state: TState;
  readonly reducers: {
    [K in keyof TFactories]: TFactories[K] extends StageFactory<infer Id, infer Payload, infer Output, infer Meta>
      ? {
          readonly id: Id;
          readonly payload: Payload;
          readonly output: Output;
          readonly meta: Meta;
          readonly apply: StageReducer<TState, Payload>;
        }
      : never;
  };
};

export const buildReducerChain = <TState, TFactories extends readonly StageFactory<string, unknown, unknown, Record<string, unknown>>[]>(
  state: TState,
  factories: TFactories,
): StageReducerTuple<TState, TFactories> => {
  const reducers = factories.map((factory) => {
    const wrapped: StageReducer<TState, any> = (acc, action: any) => ({
      ...acc,
      ...(typeof action === 'object' && action !== null ? action : {}),
      generated: true,
    }) as TState;
    return {
      id: factory.id,
      payload: null as any,
      output: null as any,
      meta: {} as Record<string, unknown>,
      apply: wrapped,
    };
  }) as StageReducerTuple<TState, TFactories>['reducers'];

  return { state, reducers };
};

export type StageDispatcher<TFactories extends readonly StageFactory<string, unknown, unknown, Record<string, unknown>>[]> = {
  [K in keyof TFactories]: TFactories[K] extends StageFactory<infer Id, unknown, unknown, Record<string, unknown>> ? Id : never;
};

export const dispatchFactories = <TFactories extends readonly StageFactory<string, unknown, unknown, Record<string, unknown>>[]>(factories: TFactories): StageDispatcher<TFactories> => {
  return factories.map((factory) => factory.id) as StageDispatcher<TFactories>;
};

export type PluginFactory<TName extends string, TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export type HigherOrderFactory<
  TOuter extends string,
  TInner extends string,
  TInput,
  TOutput,
> = {
  readonly outer: TOuter;
  readonly inner: TInner;
  readonly invoke: PluginFactory<TOuter, TInput, TOutput>;
};

export const composeFactories = <
  TOuter extends string,
  TInner extends string,
  TInput,
  TOutput,
>(
  outer: TOuter,
  inner: TInner,
): HigherOrderFactory<TOuter, TInner, TInput, TOutput> => ({
  outer,
  inner,
    invoke: async (input: TInput) => {
    const mid = {
      seed: 1,
    } as { seed: number };
      return (Promise.resolve(input) as Promise<unknown>).then(() => {
        return {
          transformed: String(input),
          stage: inner,
        } as unknown as TOutput;
      });
    },
  });

export const factoryAlpha = createStage('alpha')((input: { token: string }, context) => ({
  ...context,
  label: `alpha:${input.token}:${context.stage}`,
}));

export const factoryBeta = createStage('beta')((input: { token: string; score: number }, context) => ({
  label: `beta:${input.token}:${context.stage.length}`,
  score: input.score,
  marker: context.stage,
}));

export const factoryGamma = createStage('gamma')((input: { score: number }, context) => ({
  label: `gamma:${context.stage}`,
  values: Array.from({ length: input.score }).map((_, index) => `${index}`),
  score: input.score,
}));

export const factories: readonly [
  StageFactory<'alpha', { token: string }, { label: string; stage: Record<string, unknown>; ready: true }>,
  StageFactory<'beta', { token: string; score: number }, { label: string; score: number; marker: Record<string, unknown> }>,
  StageFactory<'gamma', { score: number }, { label: string; values: string[]; score: number }>,
] = [
  { id: factoryAlpha.id, run: factoryAlpha.run },
  { id: factoryBeta.id, run: factoryBeta.run },
  { id: factoryGamma.id, run: factoryGamma.run },
];

export const dispatchIds = dispatchFactories(factories as unknown as readonly StageFactory<string, unknown, unknown, Record<string, unknown>>[]);

export const reducerChain = buildReducerChain({ baseline: true }, factories as unknown as readonly StageFactory<string, unknown, unknown, Record<string, unknown>>[]);

export const invocation = dispatchIds.map((id) => `run:${id}`);

export const higherOrderAlpha = composeFactories('outer-a', 'inner-a');
export const higherOrderBeta = composeFactories('outer-b', 'inner-b');
export const higherOrderGamma = composeFactories('outer-c', 'inner-c');

export type InstantiationMatrix = typeof higherOrderAlpha | typeof higherOrderBeta | typeof higherOrderGamma;

export const instantiateMatrix = async () => {
  const alpha = await higherOrderAlpha.invoke({} as { transformed: string; seed: number; stage?: string });
  const beta = await higherOrderBeta.invoke({} as { transformed: string; seed: number; stage?: string });
  const gamma = await higherOrderGamma.invoke({} as { transformed: string; seed: number; stage?: string });
  return { alpha, beta, gamma };
};

export const instantiateCatalog = {
  factories,
  dispatchIds,
  reducerChain,
  invocation,
  invocationResult: reducerChain,
};

export type InstantiatedCatalog = typeof instantiateCatalog;

export const runInstantiationMatrix = async () => {
  const invocations = await instantiateMatrix();
  return {
    ...invocations,
    meta: {
      factoryCount: factories.length,
      dispatchCount: dispatchIds.length,
      reducerCount: reducerChain.reducers.length,
    },
  };
};

export const noInfer = <T>(value: T): [T, [T]] => [value, [value]];

export const invokeAll = async () => {
  const results = await Promise.all([higherOrderAlpha, higherOrderBeta, higherOrderGamma].map((entry) => entry.invoke('seed' as unknown as never)));
  return results;
};
