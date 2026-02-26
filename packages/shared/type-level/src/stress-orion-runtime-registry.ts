export type PluginState = 'cold' | 'warm' | 'active' | 'stopping' | 'retired';
export type PluginMode = 'inline' | 'deferred' | 'async' | 'burst';
export type PluginKey<TName extends string> = `plugin:${TName}`;

export type PluginPayload<TData extends Record<string, unknown>> = {
  readonly id: string;
  readonly data: TData;
  readonly trace: ReadonlyArray<string>;
};

export interface PluginContract<
  TName extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: TName;
  readonly key: PluginKey<TName>;
  readonly mode: PluginMode;
  readonly state: PluginState;
  readonly run: (payload: PluginPayload<TData>) => Promise<TOutput>;
}

export interface RegistryEnvelope<TName extends string = string> {
  readonly key: PluginKey<TName>;
  readonly label: `registry/${TName}`;
  readonly index: number;
  readonly active: boolean;
}

export type RegistryMap<
  TName extends string,
  TData extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> = {
  readonly [K in `plugin:${TName}`]: PluginContract<TName, TData, TOutput>;
};

export class AsyncOrionScope {
  readonly #dispose: Promise<void>;
  readonly #stack: AsyncDisposableStack;
  readonly #tasks: Array<Promise<void>> = [];

  constructor() {
    this.#stack = new AsyncDisposableStack();
    this.#dispose = Promise.resolve();
  }

  schedule(task: Promise<void>): void {
    this.#tasks.push(task);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack.disposeAsync();
    await Promise.all(this.#tasks);
  }
}

export class RuntimeRegistry<
  TName extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  #index: number = 0;
  readonly entries = new Map<PluginKey<TName>, {
    envelope: RegistryEnvelope<TName>;
    contract: PluginContract<TName, TData, TOutput>;
  }>();

  [Symbol.dispose](): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  register(contract: PluginContract<TName, TData, TOutput>): RegistryEnvelope<TName> {
    const envelope: RegistryEnvelope<TName> = {
      key: `${contract.key}` as PluginKey<TName>,
      label: `registry/${contract.name}`,
      index: this.#index += 1,
      active: true,
    };
    this.entries.set(contract.key, {
      envelope,
      contract,
    });
    return envelope;
  }

  resolve(key: PluginKey<TName>): PluginContract<TName, TData, TOutput> | undefined {
    const entry = this.entries.get(key);
    return entry?.contract;
  }

  keys(): ReadonlyArray<RegistryEnvelope<TName>> {
    return Array.from(this.entries.values()).map((value) => value.envelope);
  }

  async execute(key: PluginKey<TName>, payload: PluginPayload<TData>): Promise<TOutput> {
    const hit = this.entries.get(key);
    if (!hit) {
      throw new Error(`missing contract for ${key}`);
    }
    const output = await hit.contract.run(payload as PluginPayload<TData>);
    return output as TOutput;
  }
}

export const defineRegistryPlugin = <
  TName extends string,
  TData extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(
  name: TName,
  mode: PluginMode,
  run: (payload: PluginPayload<TData>) => Promise<TOutput>,
): PluginContract<TName, TData, TOutput> => ({
  name,
  key: `plugin:${name}` as PluginKey<TName>,
  mode,
  state: 'cold',
  run,
});

export const withOrionScope = async <
  TName extends string,
  TData extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
  TResult,
>(
  name: TName,
  callback: (registry: RuntimeRegistry<TName, TData, TOutput>, scope: AsyncOrionScope) => Promise<TResult>,
): Promise<TResult> => {
  const registry = new RuntimeRegistry<TName, TData, TOutput>();
  const scope = new AsyncOrionScope();

  const disposer = {
    [Symbol.asyncDispose]: async () => {
      await scope[Symbol.asyncDispose]();
      registry[Symbol.dispose]();
    },
  };

  scope.schedule(Promise.resolve());
  const result = await callback(registry, scope);
  await disposer[Symbol.asyncDispose]();
  return result;
};

export const pluginPayloadFromTuple = <TData extends Record<string, unknown>>(
  id: string,
  data: TData,
  trace: readonly string[] = [],
): PluginPayload<TData> => ({
  id,
  data,
  trace,
});

export const buildDemoRegistry = (): RuntimeRegistry<'alpha', { readonly tag: string }, { readonly accepted: boolean }> => {
  const registry = new RuntimeRegistry<'alpha', { readonly tag: string }, { readonly accepted: boolean }>();
  const fast = defineRegistryPlugin('alpha', 'inline', async (payload) => ({
    accepted: payload.id.length > 0 && ((payload.data as { tag: string }).tag.length ?? 0) > 0,
  }));
  registry.register(fast);
  return registry;
};

export const runDemoRegistry = async () => {
  const registry = buildDemoRegistry();
  const input: PluginPayload<{ readonly tag: string }> = {
    id: 'demo-1',
    data: { tag: 'orion' },
    trace: ['boot'],
  };

  const result = await registry.execute('plugin:alpha', input as PluginPayload<{ readonly tag: string }>);
  return {
    size: registry.size,
    result,
  };
};
