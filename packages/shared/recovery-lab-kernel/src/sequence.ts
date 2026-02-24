import { NoInfer } from '@shared/type-level';
import { drainIterator, mapIterator } from './iterable';
import type { PluginDefinition, PluginInputOf, PluginKind, PluginOutputOf } from './traits';

export interface TimelineSeed {
  readonly seed: string;
  readonly createdAt: number;
}

export type StageFn<TInput, TOutput> = (input: TInput) => Promise<TOutput> | TOutput;

export type StageChain<TInput, TStages extends readonly unknown[]> = TStages extends readonly []
  ? TInput
  : TStages extends readonly [infer Head, ...infer Tail]
    ? Head extends StageFn<infer Left, infer Right>
      ? TInput extends Left
        ? StageChain<Right, Tail>
        : never
      : never
    : TInput;

export const stage = <TInput, TOutput>(run: StageFn<TInput, TOutput>): StageFn<TInput, TOutput> => run;

export type StageDefinitions<TInput, TSeed extends readonly PluginDefinition<any, any, PluginKind>[]> = {
  readonly seed: TInput;
  readonly stages: TSeed;
};

export interface PipelineExecution<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly touched: number;
  readonly elapsedMs: number;
}

export const executePipeline = async <
  TInput,
  TStages extends readonly StageFn<any, any>[],
>(
  input: TInput,
  ...stages: [...TStages]
): Promise<{
  readonly output: StageChain<TInput, TStages>;
  readonly touched: number;
  readonly elapsedMs: number;
}> => {
  let current: unknown = input;
  const touched = stages.length;
  const start = performance.now();

  for (const stage of stages) {
    current = await stage(current);
  }

  return {
    output: current as StageChain<TInput, TStages>,
    touched,
    // eslint-disable-next-line no-magic-numbers
    elapsedMs: performance.now() - start,
  };
};

export const executeTypedPipeline = async <
  TInput,
  TOutput,
  const Stages extends readonly PluginDefinition<any, any, PluginKind>[],
>(
  input: TInput,
  plugins: NoInfer<Stages>,
  context: TimelineSeed,
  execute: <TIn, TOut>(plugin: PluginDefinition<TIn, TOut, PluginKind>, payload: TIn) => Promise<TOut>,
): Promise<PipelineExecution<TInput, TOutput>> => {
  let current: unknown = input;
  for (const plugin of plugins) {
    const next = await execute(plugin, current as PluginInputOf<typeof plugin>);
    current = next;
  }

  const payload = {
    input,
    output: current as TOutput,
    touched: plugins.length,
    elapsedMs: plugins.length > 0 ? Date.now() - context.createdAt : 0,
  };
  return payload;
};

export const flattenStageInputs = <T>(
  pipelines: Iterable<readonly [number, readonly T[]]>,
): readonly T[] => {
  const tuples = [...pipelines];
  const flat = tuples.reduce<T[]>((acc, [, stages]) => {
    acc.push(...stages);
    return acc;
  }, []);
  return [...mapIterator(drainIterator(flat), (value) => value)];
};

export type RouteMap<T extends string> = T extends `${infer Prefix}:${infer Tail}`
  ? `${Prefix}:${Tail}` | Prefix
  : T;

export interface RoutePlan<TRoutes extends readonly string[]> {
  readonly routes: TRoutes;
  readonly map: { readonly [K in TRoutes[number] as RouteMap<K>]: K };
}

export const normalizeRoutes = <TRoutes extends readonly string[]>(routes: NoInfer<TRoutes>): RoutePlan<TRoutes> => {
  const mapEntries = new Map<string, string>();
  for (const route of routes) {
    mapEntries.set(route.split(':')[0] ?? route, route);
  }
  return {
    routes,
    map: Object.fromEntries(mapEntries) as { [K in TRoutes[number] as RouteMap<K>]: K },
  };
};
