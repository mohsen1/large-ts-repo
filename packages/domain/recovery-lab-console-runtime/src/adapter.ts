import { z } from 'zod';
import {
  type RuntimeContext,
  type RuntimePolicyMode,
  type RuntimePlugin,
} from './types.js';

export interface PluginAdapter<TIn = unknown, TOut = unknown, TMode extends RuntimePolicyMode = RuntimePolicyMode> {
  readonly id: string;
  readonly mode: TMode;
  adapt(input: TIn, context: RuntimeContext): Promise<TOut>;
}

export type AdapterResult<TAdapter extends PluginAdapter<any, any>> = TAdapter extends PluginAdapter<infer TInput, infer TOutput>
  ? { readonly input: TInput; readonly output: TOutput }
  : never;

export type AdapterTuple<TAdapters extends readonly PluginAdapter[]> = {
  [K in keyof TAdapters]: TAdapters[K] extends PluginAdapter<infer TInput, infer TOutput>
    ? AdapterResult<PluginAdapter<TInput, TOutput>>
    : never;
};

export const adapterSchema = z.object({
  id: z.string().min(2),
  mode: z.enum(['manual', 'adaptive', 'predictive', 'resilient']),
  transforms: z.array(z.record(z.unknown())).optional(),
});

export interface AdapterEnvelope<TInput = unknown, TOutput = unknown> {
  readonly input: TInput;
  readonly output: TOutput;
}

export const runAdapter = async <TIn, TOut>(
  adapter: PluginAdapter<TIn, TOut>,
  input: TIn,
  context: RuntimeContext,
): Promise<TOut> => adapter.adapt(input, context);

export const combineAdapters = <TIn, TOut>(
  ...adapters: PluginAdapter<any, any>[]
): PluginAdapter<TIn, TOut> => {
  const chain = [...adapters];
  return {
    id: `combined:${chain.length}`,
    mode: chain[0]?.mode as TIn extends never ? never : TIn ? 'manual' : 'manual',
    adapt: async (input, context) => {
      let current: unknown = input;
      for (const adapter of chain) {
        const next = await (adapter as PluginAdapter<unknown, unknown>).adapt(current, context);
        current = next;
      }
      return current as TOut;
    },
  };
};

export const adaptPayload = <TInput, TOutput>(
  input: TInput,
  adapter: PluginAdapter<TInput, TOutput>,
  context: RuntimeContext,
): Promise<TOutput> => runAdapter(adapter, input, context);

export interface PluginAdapterRegistry {
  readonly register: <TIn, TOut>(id: string, adapter: PluginAdapter<TIn, TOut>) => void;
  readonly get: <TIn, TOut>(id: string) => PluginAdapter<TIn, TOut> | null;
  readonly run: <TIn, TOut>(id: string, input: TIn, context: RuntimeContext) => Promise<TOut>;
}

export class RecoveryAdapterRegistry implements PluginAdapterRegistry {
  readonly #adapters = new Map<string, PluginAdapter>();

  public register<TIn, TOut>(id: string, adapter: PluginAdapter<TIn, TOut>): void {
    this.#adapters.set(id, adapter);
  }

  public get<TIn, TOut>(id: string): PluginAdapter<TIn, TOut> | null {
    return (this.#adapters.get(id) as PluginAdapter<TIn, TOut>) ?? null;
  }

  public async run<TIn, TOut>(id: string, input: TIn, context: RuntimeContext): Promise<TOut> {
    const adapter = this.get<TIn, TOut>(id);
    if (!adapter) {
      throw new Error(`missing adapter ${id}`);
    }
    return adapter.adapt(input, context);
  }
}

export const toNoopAdapter = <T>(id: string): PluginAdapter<T, T> => ({
  id,
  mode: 'manual',
  adapt: async (input) => input,
});

export const asRuntimePluginAdapter = <
  TIn,
  TOut,
  TPlugin extends RuntimePlugin,
>(plugin: TPlugin, options: { readonly id: string; readonly mode: RuntimePolicyMode }): PluginAdapter<TIn, TOut> => ({
  id: `${options.id}::${plugin.name}`,
  mode: options.mode,
  adapt: async (input, context) => {
    const output = await plugin.execute(input, context);
    return output as TOut;
  },
});
