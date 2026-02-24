import { type NoInfer, type PluginSignal, type PluginOutput } from './types.js';

export interface AsyncChunk<T> {
  readonly values: readonly T[];
  readonly metadata: {
    readonly at: number;
    readonly hasMore: boolean;
  };
}

export interface StreamOptions {
  readonly batchSize: number;
  readonly timeoutMs: number;
}

export interface StreamMetrics {
  readonly processed: number;
  readonly emitted: number;
  readonly windowMs: number;
  readonly routeCoverage: ReadonlyMap<string, number>;
}

const defaultStreamOptions = {
  batchSize: 16,
  timeoutMs: 250,
} satisfies StreamOptions;

export const chunkify = function <T>(values: readonly T[], size: number): readonly T[][] {
  if (size <= 0) return [];
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push([...values].slice(index, index + size));
  }
  return output;
};

export async function* streamToAsync<T>(
  values: readonly T[],
  options: NoInfer<Partial<StreamOptions>> = {},
): AsyncGenerator<T> {
  const resolved = {
    ...defaultStreamOptions,
    ...options,
  } satisfies StreamOptions;
  let processed = 0;
  const iterator = values[Symbol.iterator]();
  for (const value of iterator) {
    if (processed % resolved.batchSize === 0) {
      await new Promise((resolve) => setTimeout(resolve, resolved.timeoutMs));
    }
    processed += 1;
    yield value;
  }
}

export const collectBatches = async <T>(
  values: readonly T[],
  options: NoInfer<Partial<StreamOptions>> = {},
): Promise<AsyncChunk<T>[]> => {
  const resolved = {
    ...defaultStreamOptions,
    ...options,
  } satisfies StreamOptions;
  const chunks = chunkify(values, resolved.batchSize);
  const output: AsyncChunk<T>[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    output.push({
      values: chunk,
      metadata: {
        at: Date.now(),
        hasMore: index < chunks.length - 1,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, resolved.timeoutMs));
  }
  return output;
};

export async function hydrateWithSignal<T extends { id: string }>(
  values: readonly T[],
  buildSignal: (value: T) => PluginSignal,
): Promise<Array<{ item: T; signal: PluginSignal }>> {
  const output: Array<{ item: T; signal: PluginSignal }> = [];
  for await (const item of streamToAsync(values)) {
    output.push({
      item,
      signal: buildSignal(item),
    });
  }
  return output;
}

export async function collectRouteSignals<T>(
  values: readonly PluginOutput<T>[],
): Promise<StreamMetrics> {
  const routeCoverage = new Map<string, number>();
  let processed = 0;
  let emitted = 0;

  for await (const value of streamToAsync(values, { batchSize: 8, timeoutMs: 1 })) {
    emitted += 1;
    const current = routeCoverage.get(value.plugin) ?? 0;
    routeCoverage.set(value.plugin, current + 1);
    if (value.durationMs) {
      processed += value.durationMs;
    }
  }

  return {
    processed,
    emitted,
    windowMs: processed > 0 ? processed : 1,
    routeCoverage,
  };
}
