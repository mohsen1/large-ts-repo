import { type NoInfer } from '@shared/type-level';

export interface ArcaneAdapter<TInput, TOutput, TContext extends Record<string, unknown>> {
  readonly name: string;
  readonly weight: number;
  readonly transforms: {
    readonly input: Partial<NoInfer<TContext>>;
  };
  readonly adapt: (input: NoInfer<TInput>, context: NoInfer<TContext>) => Promise<TOutput>;
  readonly describe: () => string;
}

export type AdapterTuple<TAdapters extends readonly ArcaneAdapter<any, any, any>[]> = TAdapters extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends ArcaneAdapter<infer I, infer O, infer C>
    ? readonly [ArcaneAdapter<I, O, C>, ...AdapterTuple<Tail extends readonly ArcaneAdapter<any, any, any>[] ? Tail : []>]
    : never
  : [];

export type AdapterOutput<TAdapters extends readonly ArcaneAdapter<any, any, any>[], TSeed> = TAdapters extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends ArcaneAdapter<infer _Input, infer TOutput, any>
    ? AdapterOutput<Tail extends readonly ArcaneAdapter<any, any, any>[] ? Tail : [], TOutput>
    : TSeed
  : TSeed;

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      from?: <TValue>(value: Iterable<TValue>) => { toArray(): TValue[] };
    };
  }).Iterator;

const toArray = <T>(value: Iterable<T>): readonly T[] => iteratorFrom?.from?.(value)?.toArray() ?? Array.from(value);

export const buildAdapterBundle = <TInput, TAdapters extends readonly ArcaneAdapter<any, any, Record<string, unknown>>[]>(
  adapters: NoInfer<TAdapters>,
): {
  readonly execute: <TContext extends Record<string, unknown>>(
    input: TInput,
    context: TContext,
  ) => Promise<AdapterOutput<TAdapters, TInput>>;
  readonly describe: () => string;
} => {
  const ordered = [...toArray(adapters)].sort((left, right) => right.weight - left.weight);

  return {
    execute: async (input, context) => {
      let cursor: unknown = input;
      for (const adapter of ordered) {
        const merged = {
          ...context,
          ...adapter.transforms.input,
        };
        cursor = await adapter.adapt(cursor as never, merged as never);
      }
      return cursor as AdapterOutput<TAdapters, TInput>;
    },
    describe: () => {
      return toArray(ordered).map((adapter) => `${adapter.name}:${adapter.weight}`).join(' -> ');
    },
  };
};

export const composeAdapters = <
  TInput,
  TAdapters extends readonly ArcaneAdapter<any, any, Record<string, unknown>>[],
>(
  adapters: NoInfer<TAdapters>,
) => {
  const bundle = buildAdapterBundle<TInput, TAdapters>(adapters);
  return bundle.execute;
};

export const mapAdapterTelemetry = async <TInput, TOutput>(
  label: string,
  input: TInput,
  execute: (value: TInput) => Promise<TOutput>,
): Promise<{
  readonly label: string;
  readonly output: TOutput;
  readonly metrics: { readonly startedAt: string; readonly endedAt: string; readonly elapsedMs: number };
}> => {
  const startedAt = Date.now();
  const output = await execute(input);
  const endedAt = Date.now();

  return {
    label,
    output,
    metrics: {
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      elapsedMs: endedAt - startedAt,
    },
  };
};

export const foldAdapters = async <TInput>(
  input: TInput,
  adapters: readonly ArcaneAdapter<TInput, unknown, Record<string, unknown>>[],
): Promise<unknown> => {
  let cursor = input as TInput;
  for (const adapter of adapters) {
    cursor = (await adapter.adapt(cursor, { adapter: adapter.name }) as never) as TInput;
  }
  return cursor;
};
