import { NoInfer, type Merge } from '@shared/type-level';
import {
  type PluginOutput,
  type SagaPluginDefinition,
  type SagaPluginOptions,
  type SagaPluginTag,
  type SagaNamespace,
  type SagaPhase,
  defaultSagaPluginDescriptor,
} from './types';

type PluginDefinitionBag = Record<string, SagaPluginDefinition<string, object, unknown>>;
type PluginOutputShape<TDefinitions extends PluginDefinitionBag> = {
  [K in keyof TDefinitions]: TDefinitions[K] extends SagaPluginDefinition<string, object, infer TOutput> ? PluginOutput<TOutput> : never;
};
type RemapOutputs<TDefinitions extends PluginDefinitionBag> = {
  [K in keyof TDefinitions as `plugins/${string & K}`]: PluginOutputShape<TDefinitions>[K];
};

const compareDependencyOrder = <TDefinitions extends PluginDefinitionBag>(
  definitions: TDefinitions,
): (keyof TDefinitions & string)[] => {
  const keys = new Set<keyof TDefinitions & string>();
  const sorted: Array<keyof TDefinitions & string> = [];
  const visiting = new Set<string>();

  const visit = (id: keyof TDefinitions & string) => {
    if (sorted.includes(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    const current = definitions[id];
    const dependencies = current?.dependencies ?? [];
    for (const dependency of dependencies) {
      const dependencyId = dependency.replace(/^plugin:/, '') as keyof TDefinitions & string;
      if (definitions[dependencyId]) {
        visit(dependencyId);
      }
    }
    visiting.delete(id);
    sorted.push(id);
  };

  for (const key in definitions) {
    visit(key as keyof TDefinitions & string);
  }
  return sorted;
};

export interface SagaPluginRegistryInput<
  TName extends string,
  TContext extends object = object,
  TOutput = unknown,
> {
  readonly pluginName: SagaPluginTag | `plugin:${TName}`;
  readonly namespace: SagaNamespace;
  readonly context: TContext;
  readonly options: Omit<SagaPluginOptions, 'namespace'> & { readonly namespace: SagaNamespace };
  readonly setup: (context: TContext, options: NoInfer<SagaPluginOptions>) => Promise<PluginOutput<TOutput>>;
}

export class SagaPluginRegistry<TDefinitions extends PluginDefinitionBag> {
  readonly #definitions: TDefinitions;
  readonly #descriptors = new Map<string, typeof defaultSagaPluginDescriptor>();
  readonly #outputs = new Map<string, PluginOutput>();
  readonly #bootOrder: Array<keyof TDefinitions & string> = [];
  readonly #activated = new Set<keyof TDefinitions & string>();

  constructor(definitions: TDefinitions) {
    this.#definitions = definitions;
    for (const key of Object.keys(definitions)) {
      this.#descriptors.set(key, defaultSagaPluginDescriptor);
    }
  }

  async bootstrap<TKey extends keyof TDefinitions & string>(
    key: TKey,
    context: Parameters<TDefinitions[TKey]['setup']>[0],
    options: Parameters<TDefinitions[TKey]['setup']>[1],
  ): Promise<PluginOutputShape<TDefinitions>[TKey]> {
    const definition = this.#definitions[key];
    if (!definition) {
      throw new Error(`plugin not registered: ${key}`);
    }
    if (this.#activated.has(key)) {
      return this.#outputs.get(key) as PluginOutputShape<TDefinitions>[TKey];
    }
    for (const dependency of definition.dependencies) {
      const normalized = dependency.replace(/^plugin:/, '') as keyof TDefinitions & string;
      if (this.#definitions[normalized]) {
        await this.bootstrap(normalized, context, options as never);
      }
    }
    const output = await definition.setup(context, options);
    this.#outputs.set(key, output as PluginOutput);
    this.#activated.add(key);
    this.#bootOrder.push(key);
    return output as PluginOutputShape<TDefinitions>[TKey];
  }

  get outputs(): Merge<RemapOutputs<TDefinitions>, { [K in keyof TDefinitions]: PluginOutputShape<TDefinitions>[K] }> {
    const merged = {} as Merge<RemapOutputs<TDefinitions>, { [K in keyof TDefinitions]: PluginOutputShape<TDefinitions>[K] }>;
    for (const [key, output] of this.#outputs.entries()) {
      merged[key as keyof TDefinitions] = output as never;
    }
    return merged;
  }

  plugins(): readonly (keyof TDefinitions & string)[] {
    return compareDependencyOrder(this.#definitions);
  }

  async shutdown(): Promise<void> {
    for (let index = this.#bootOrder.length - 1; index >= 0; index -= 1) {
      const key = this.#bootOrder[index];
      const definition = this.#definitions[key];
      const output = this.#outputs.get(key as string);
      if (definition?.teardown && output) {
        await definition.teardown(({ runNamespace: 'saga:bootstrap' } as never), output as never);
      }
    }
    this.#bootOrder.length = 0;
    this.#outputs.clear();
    this.#activated.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.shutdown();
  }

  descriptorFor<K extends keyof TDefinitions & string>(plugin: K): typeof defaultSagaPluginDescriptor {
    const current = this.#descriptors.get(plugin);
    if (!current) {
      throw new Error(`plugin descriptor missing: ${plugin}`);
    }
    return current;
  }
}

export const pluginAwareEvent = <TName extends string, TValue>(
  namespace: `plugin:${TName}`,
  namespacePhase: string,
  payload: TValue,
): {
  readonly namespace: `plugin:${TName}`;
  readonly kind: `plugin:${TName}::${SagaPhase}`;
  readonly payload: TValue;
  readonly phase: SagaPhase;
} => {
  const phase = (namespacePhase as SagaPhase) in {
    prepare: null,
    activate: null,
    execute: null,
    audit: null,
    retire: null,
  }
    ? (namespacePhase as SagaPhase)
    : 'prepare';
  return {
    namespace,
    kind: `${namespace}::${phase}`,
    payload,
    phase,
  };
};
