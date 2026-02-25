import { Brand } from '@shared/type-level';
import type { StageVerb, StagePlan, StageConfigSchema } from './types';

export type RegistryId = Brand<string, 'DesignPluginId'>;
export type Disposer = () => void;

export interface PluginContext {
  readonly runId: string;
  readonly scenario: string;
  readonly clock: bigint;
}

export interface ScenarioPlugin<TKind extends StageVerb, TInput = unknown, TOutput = unknown> {
  readonly id: RegistryId;
  readonly label: string;
  readonly kind: TKind;
  readonly config: StageConfigSchema<TKind>;
  readonly execute: (input: TInput, context: PluginContext) => Promise<TOutput>;
  readonly dispose?: Disposer;
}

export type PluginTuple<TPlugins extends readonly ScenarioPlugin<StageVerb, unknown, unknown>[]> = {
  readonly [I in keyof TPlugins]: TPlugins[I];
};

export type PluginByKind<TPlugins extends readonly ScenarioPlugin<StageVerb, unknown, unknown>[], TKind extends StageVerb> =
  Extract<TPlugins[number], { kind: TKind }> extends infer P
    ? P extends ScenarioPlugin<TKind, unknown, unknown>
      ? P
      : never
    : never;

export type PluginShape<TKind extends StageVerb, TInput, TOutput> =
  TKind extends StageVerb
    ? ScenarioPlugin<TKind, TInput, TOutput>
    : ScenarioPlugin<StageVerb, unknown, unknown>;

export interface RegistryEvent {
  readonly id: RegistryId;
  readonly kind: StageVerb;
  readonly stage: string;
}

export class ScenarioPluginRegistry<TPlugins extends readonly ScenarioPlugin<StageVerb, unknown, unknown>[]> {
  readonly #plugins = new Map<RegistryId, TPlugins[number]>();
  readonly #listeners = new Map<RegistryEvent['kind'], Set<(event: RegistryEvent) => void>>();
  readonly #order: RegistryId[] = [];

  constructor(plugins: TPlugins) {
    for (const plugin of plugins) {
      this.#plugins.set(plugin.id, plugin);
      this.#order.push(plugin.id);
    }
  }

  get count(): number {
    return this.#plugins.size;
  }

  all(): readonly TPlugins[number][] {
    return this.#order.map((id) => this.#plugins.get(id)).filter((entry): entry is TPlugins[number] => Boolean(entry));
  }

  register(plugin: TPlugins[number]): void {
    if (!this.#plugins.has(plugin.id)) {
      this.#order.push(plugin.id);
    }
    this.#plugins.set(plugin.id, plugin);
    this.#emit(plugin.kind, {
      id: plugin.id,
      kind: plugin.kind,
      stage: plugin.label,
    });
  }

  remove(id: RegistryId): TPlugins[number] | undefined {
    const plugin = this.#plugins.get(id);
    if (!plugin) {
      return undefined;
    }
    this.#plugins.delete(id);
    this.#order.splice(this.#order.indexOf(id), 1);
    plugin.dispose?.();
    return plugin;
  }

  byKind<TKind extends StageVerb>(kind: TKind): readonly PluginByKind<TPlugins, TKind>[] {
    const result: PluginByKind<TPlugins, TKind>[] = [];
    for (const plugin of this.#plugins.values()) {
      if (plugin.kind === kind) {
        result.push(plugin as PluginByKind<TPlugins, TKind>);
      }
    }
    return result;
  }

  on(kind: RegistryEvent['kind'], handler: (event: RegistryEvent) => void): () => void {
    const bucket = this.#listeners.get(kind) ?? new Set();
    bucket.add(handler);
    this.#listeners.set(kind, bucket);
    return () => {
      bucket.delete(handler);
      if (bucket.size === 0) {
        this.#listeners.delete(kind);
      }
    };
  }

  [Symbol.dispose](): void {
    for (const plugin of this.#plugins.values()) {
      plugin.dispose?.();
    }
    this.#plugins.clear();
    this.#listeners.clear();
    this.#order.length = 0;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve(this[Symbol.dispose]());
  }

  #emit(kind: RegistryEvent['kind'], event: RegistryEvent): void {
    for (const handler of this.#listeners.get(kind) ?? []) {
      handler(event);
    }
  }
}

export async function runPluginSequence<TInput, TOutput>(
  input: TInput,
  plugins: readonly ScenarioPlugin<StageVerb, TInput, TOutput>[],
  context: PluginContext,
): Promise<TOutput> {
  let cursor: TInput | TOutput = input;
  for (const plugin of plugins) {
    const output = await plugin.execute(cursor as TInput, context);
    cursor = output;
  }
  return cursor as TOutput;
}

export function* registryIterator<TPlugins extends readonly ScenarioPlugin<StageVerb, unknown, unknown>[] >(
  registry: ScenarioPluginRegistry<TPlugins>,
): Generator<TPlugins[number]> {
  for (const plugin of registry.all()) {
    yield plugin as TPlugins[number];
  }
}

export function pluginMap<TPlugins extends readonly ScenarioPlugin<StageVerb, unknown, unknown>[]>(
  registry: ScenarioPluginRegistry<TPlugins>,
): Map<string, TPlugins[number]> {
  const out = new Map<string, TPlugins[number]>();
  for (const plugin of registryIterator(registry)) {
    out.set(plugin.label, plugin);
  }
  return out;
}

export const registryDefaults = {
  idPrefix: 'sc-plug',
  allowDuplicate: false,
  strictMode: true,
} as const;
