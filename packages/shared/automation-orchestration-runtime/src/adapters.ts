import type { Brand, Mutable } from '@shared/type-level';
import { asTenant, type StageResult } from './contract';

export type AdapterId = Brand<string, 'AdapterId'>;
export type AdapterKind = Brand<string, 'AdapterKind'>;
export type AdapterTag<T extends string = string> = `adapter:${T}`;

export interface AdapterTrace {
  readonly id: AdapterId;
  readonly at: string;
  readonly namespace: string;
  readonly tags: readonly AdapterTag[];
}

export interface PluginAdapter<I = unknown, O = unknown, C = unknown> {
  readonly id: AdapterId;
  readonly kind: AdapterKind;
  readonly capabilities: readonly AdapterTag[];
  adapt(input: I, context: AdapterContext<C>): Promise<PluginAdapterResult<O>>;
  close?: (trace: AdapterTrace) => Promise<void> | void;
}

export interface PluginAdapterResult<T = unknown> {
  readonly accepted: boolean;
  readonly payload: T;
  readonly diagnostics: readonly string[];
  readonly runAt: string;
}

export interface AdapterContext<T = unknown> {
  readonly namespace: string;
  readonly tenant: ReturnType<typeof asTenant>;
  readonly metadata?: T;
}

export type AdapterState = {
  readonly id: AdapterId;
  readonly runCount: number;
  readonly lastRunAt?: string;
};

export type AdapterRunPlan<TAdapters extends readonly PluginAdapter[]> = {
  [Index in keyof TAdapters]: TAdapters[Index] & {
    readonly order: Index extends `${number}` ? Index : never;
  };
};

export const createAdapter = <TInput, TOutput>(input: {
  readonly id: string;
  readonly kind: string;
  readonly capabilities?: readonly string[];
  readonly adapt: (input: TInput, context: AdapterContext) => Promise<PluginAdapterResult<TOutput>>;
}): PluginAdapter<TInput, TOutput> => {
  const { id, kind, capabilities, adapt } = input;
  return {
    id: id as AdapterId,
    kind: kind as AdapterKind,
    capabilities: (capabilities ?? []).map((capability) => `adapter:${capability}` as AdapterTag),
    adapt,
  };
};

export const createNoopAdapter = <TInput>(id: string): PluginAdapter<TInput, TInput> => ({
  id: id as AdapterId,
  kind: 'noop' as AdapterKind,
  capabilities: ['adapter:noop' as AdapterTag],
  adapt: async (input: TInput, context: AdapterContext) => ({
    accepted: true,
    payload: input,
    diagnostics: [`noop:${context.namespace}`, `tenant:${String(context.tenant)}`],
    runAt: new Date().toISOString(),
  }),
});

export const normalizeAdapters = <TAdapters extends readonly PluginAdapter[]>(
  adapters: TAdapters,
): TAdapters => {
  const normalized = [...adapters];
  normalized.sort((left, right) => left.kind.localeCompare(right.kind));
  return normalized as unknown as TAdapters;
};

export const adaptThrough = async <TInput, TOutput>(
  input: TInput,
  adapters: readonly PluginAdapter[],
  context: AdapterContext,
): Promise<TOutput> => {
  let payload: unknown = input;
  for (const adapter of normalizeAdapters(adapters)) {
    const result = await adapter.adapt(payload, context);
    if (!result.accepted) {
      throw new Error(`Adapter ${adapter.id} rejected payload at ${result.runAt}`);
    }
    payload = result.payload;
  }
  return payload as TOutput;
};

const asMutableState = (state: AdapterState): Mutable<AdapterState> => ({
  id: state.id,
  runCount: state.runCount,
  lastRunAt: state.lastRunAt,
});

export const collectAdapterOutput = async <TInput>(
  input: TInput,
  adapters: readonly PluginAdapter[],
): Promise<readonly StageResult<TInput>[]> => {
  const states = new Map<AdapterId, AdapterState>();
  const history: StageResult<TInput>[] = [];
  const trace = (id: AdapterId): AdapterTrace => ({
    id,
    at: new Date().toISOString(),
    namespace: 'adapter-pipeline',
    tags: ['adapter:history'],
  });

  await using stack = new AsyncDisposableStack();
  let payload: unknown = input;

  for (const adapter of normalizeAdapters(adapters)) {
    const current = asMutableState(states.get(adapter.id) ?? { id: adapter.id, runCount: 0 });
    current.runCount += 1;
    current.lastRunAt = new Date().toISOString();
    states.set(adapter.id, { ...current });

    stack.defer(() => {
      if (adapter.close) {
        return adapter.close(trace(adapter.id));
      }
    });

    const result = await adapter.adapt(payload, {
      namespace: 'adapter-pipeline',
      tenant: asTenant('global'),
    });
    payload = result.payload;
    const stage: StageResult<TInput> = {
      status: 'ok',
      output: result.payload as TInput,
      metrics: result.diagnostics.map((diagnostic, index) => ({
        metric: `metric:${index}`,
        value: diagnostic.length,
        unit: 'count',
        measuredAt: result.runAt,
      })),
      durationMs: 0,
      timestamp: result.runAt,
      channel: `channel:adapter` as `channel:${string}`,
    };
    history.push(stage);
  }

  return history;
};
