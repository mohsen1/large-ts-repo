export type AnyMiddleware = (input: any) => any;

export type PipeResult<TInput, Fns extends readonly AnyMiddleware[]> =
  Fns extends readonly [(input: TInput) => infer TOutput, ...infer Rest extends readonly AnyMiddleware[]]
    ? PipeResult<TOutput, Rest>
    : TInput;

export type PipeChain<TInput, Fns extends readonly AnyMiddleware[]> =
  Fns extends readonly [(input: TInput) => infer TOutput, ...infer Rest extends readonly AnyMiddleware[]]
    ? readonly [
        (input: TInput) => TOutput,
        ...PipeChain<TOutput, Rest>,
      ]
    : readonly [];

export type AccessEventOperation = 'get' | 'set';

export type AccessEventName<Field extends string> = `${Field}:${AccessEventOperation}`;

export type NonEmptyTuple<T> = readonly [T, ...T[]];
