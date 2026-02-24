import {
  formatISO,
  type AnyGraphPlugin,
  type PluginOutputEnvelope,
  type PluginResult,
  type RecoveryGraphEvent,
} from './types';

type AsyncScope = {
  [Symbol.asyncDispose](): Promise<void>;
  use<T>(value: T): T;
  adopt<T>(resource: T, disposer: () => void | PromiseLike<void>): T;
};

type StackLikeCtor = new () => AsyncScope;

const AsyncDisposableStackCtor = (globalThis as { AsyncDisposableStack?: StackLikeCtor }).AsyncDisposableStack;

class FallbackScope implements AsyncScope {
  readonly #disposers = new Set<() => Promise<void> | void>();

  use<T>(value: T): T {
    return value;
  }

  adopt<T>(resource: T, disposer: () => void | PromiseLike<void>): T {
    this.#disposers.add(() => Promise.resolve(disposer()));
    return resource;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const disposers = Array.from(this.#disposers);
    for (const dispose of disposers.reverse()) {
      await dispose();
    }
    this.#disposers.clear();
  }
}

const createScope = (): AsyncScope =>
  AsyncDisposableStackCtor
    ? new AsyncDisposableStackCtor()
    : new FallbackScope();

export interface AdapterStats {
  readonly pluginCount: number;
  readonly outputBytes: number;
  readonly events: number;
  readonly errors: readonly string[];
}

type RegistryLike<TPlugins extends readonly AnyGraphPlugin[]> = {
  readonly pluginOutputs: PluginOutputEnvelope<TPlugins>;
  readonly pluginSummaries: readonly { pluginId: string; status: string; metrics: readonly { metric: string; value: number }[] }[];
};

type PluginOutputKey<TPlugins extends readonly AnyGraphPlugin[]> = TPlugins[number]['id'] & string;

export class AsyncAdapterHub<TPlugins extends readonly AnyGraphPlugin[]> implements AsyncScope {
  readonly #scope = createScope();
  readonly #outputs = Object.create(null) as PluginOutputEnvelope<TPlugins>;
  readonly #diagnostics: RecoveryGraphEvent[] = [];
  readonly #errors: string[] = [];

  use<T>(value: T): T {
    return this.#scope.use(value);
  }

  adopt<T>(resource: T, disposer: () => void | PromiseLike<void>): T {
    return this.#scope.adopt(resource, disposer);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#scope[Symbol.asyncDispose]();
  }

  append<TRun extends PluginResult>(plugin: TPlugins[number], result: TRun): void {
    const key = plugin.id as PluginOutputKey<TPlugins>;
    const bucket = (this.#outputs[key] ?? []) as readonly TRun[];
    const next = [...bucket, result] as PluginOutputEnvelope<TPlugins>[PluginOutputKey<TPlugins>];
    this.#outputs[key] = next;

    this.#diagnostics.push({
      stage: plugin.stage,
      name: `graph:plugin:${plugin.name as string}` as const,
      payload: { plugin: plugin.name, producedAt: formatISO(new Date()) },
      timestamp: formatISO(new Date()),
    });
  }

  buildSummary(): RegistryLike<TPlugins> {
    const pluginOutputs = this.#outputs;
    const pluginSummaries = Object.entries(pluginOutputs).map(([pluginId, snapshots]) => {
      const list = snapshots as readonly PluginResult[];
      return {
        pluginId,
        status: list.length > 0 ? 'ok' : 'skipped',
        metrics: list.flatMap((snapshot) =>
          snapshot.records.map((entry) => ({
            metric: `out:${entry.pluginName}`,
            value: entry.outputCount,
          })),
        ),
      };
    });

    return {
      pluginOutputs,
      pluginSummaries,
    };
  }

  collectDiagnostics(): readonly RecoveryGraphEvent[] {
    return this.#diagnostics;
  }

  getStats(): AdapterStats {
    return {
      pluginCount: Object.keys(this.#outputs).length,
      outputBytes: JSON.stringify(this.#outputs).length,
      events: this.#diagnostics.length,
      errors: this.#errors,
    };
  }
}

export interface GraphAdapter<TInput = unknown, TOutput = unknown> {
  readonly adapterId: string;
  readonly execute: (input: TInput) => Promise<TOutput>;
  readonly close?: () => Promise<void>;
}

export function isAsyncDisposable(value: unknown): value is { [Symbol.asyncDispose](): PromiseLike<void> } {
  return typeof value === 'object' && value !== null && value !== undefined && Symbol.asyncDispose in (value as { [Symbol.asyncDispose]?: unknown });
}

export async function withScope<T extends AsyncScope, R>(resource: T, work: (resource: T) => Promise<R>): Promise<R> {
  try {
    return await work(resource);
  } finally {
    await resource[Symbol.asyncDispose]();
  }
}
