import { toResult } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type {
  PluginDefinitionBag,
  PluginKind,
  PluginOutput,
  PluginByKind,
} from './contract';

export interface StudioPluginRegistryInput {
  readonly definitions: PluginDefinitionBag;
}

export type RegistryDiagnostics = {
  readonly registered: readonly string[];
  readonly initialized: readonly string[];
  readonly order: readonly string[];
};

export class PlaybookStudioPluginRegistry<TDefinitions extends PluginDefinitionBag> {
  readonly #definitions: TDefinitions;
  readonly #initialized = new Set<string>();
  readonly #outputs = new Map<string, unknown>();
  readonly #bootOrder: string[] = [];

  constructor(definitions: TDefinitions) {
    this.#definitions = definitions;
  }

  private dependenciesOf(key: keyof TDefinitions & string): readonly string[] {
    const definition = this.#definitions[key];
    const dependencies = definition?.metadata?.dependencies ?? [];
    return [...dependencies]
      .map((entry) => entry.replace(/^plugin:/, ''))
      .filter((dependency): dependency is string => dependency in (this.#definitions as Record<string, unknown>));
  }

  private sortedByDependency(): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const visiting = new Set<string>();

    const visit = (key: keyof TDefinitions & string) => {
      if (seen.has(key)) return;
      if (visiting.has(key)) return;
      visiting.add(key);
      for (const dependency of this.dependenciesOf(key)) {
        visit(dependency as keyof TDefinitions & string);
      }
      visiting.delete(key);
      seen.add(key);
      ordered.push(key);
    };

    for (const key in this.#definitions) {
      visit(key);
    }

    return ordered;
  }

  bootOrder(): readonly string[] {
    return this.#bootOrder.length > 0 ? this.#bootOrder : this.sortedByDependency();
  }

  async bootstrap<K extends keyof TDefinitions & string>(
    key: K,
    context: NoInfer<Parameters<TDefinitions[K]['setup']>[0]>,
    options: NoInfer<Parameters<TDefinitions[K]['setup']>[1]>,
  ): Promise<PluginOutput<TDefinitions[K]>> {
    if (this.#initialized.has(key)) {
      return this.#outputs.get(key) as PluginOutput<TDefinitions[K]>;
    }

    const definition = this.#definitions[key];
    if (!definition) {
      throw new Error(`unknown plugin: ${key}`);
    }

    for (const dependency of this.dependenciesOf(key)) {
      await this.bootstrap(dependency as K, context, options as never);
    }

    const result = await toResult<PluginOutput<TDefinitions[K]>>(() =>
      definition.setup(context, options) as Promise<PluginOutput<TDefinitions[K]>>,
    );
    if (!result.ok) {
      throw result.error;
    }

    this.#outputs.set(key, result.value);
    this.#initialized.add(key);
    this.#bootOrder.push(key);
    return result.value as PluginOutput<TDefinitions[K]>;
  }

  async bootstrapAll(
    context: Parameters<TDefinitions[keyof TDefinitions & string]['setup']>[0],
    options: Parameters<TDefinitions[keyof TDefinitions & string]['setup']>[1],
  ): Promise<Record<keyof TDefinitions & string, PluginOutput<TDefinitions[keyof TDefinitions & string]>>> {
    const output = {} as Record<
      keyof TDefinitions & string,
      PluginOutput<TDefinitions[keyof TDefinitions & string]>
    >;
    for (const key of this.sortedByDependency()) {
      output[key as keyof TDefinitions & string] = await this.bootstrap(
        key as keyof TDefinitions & string,
        context as never,
        options as never,
      );
    }
    return output;
  }

  diagnostics(): RegistryDiagnostics {
    return {
      registered: Object.keys(this.#definitions),
      initialized: [...this.#initialized],
      order: [...this.#bootOrder],
    };
  }

  get plugins(): PluginByKind<TDefinitions, 'planner'> {
    const bag = {} as PluginByKind<TDefinitions, 'planner'>;
    for (const key in this.#definitions) {
      const entry = this.#definitions[key as keyof TDefinitions & string];
      if (entry.kind === 'planner') {
        (bag as Record<string, unknown>)[key] = entry;
      }
    }
    return bag;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#initialized.clear();
    this.#bootOrder.length = 0;
    this.#outputs.clear();
  }
}

export interface PluginMetadata {
  readonly stage: `plugin:${string}`;
  readonly kind: PluginKind;
  readonly order: number;
}

export const pluginAwareEvent = <TKind extends string>(
  namespace: `plugin:${string}`,
  namespacePhase: string,
  payload: unknown,
): {
  readonly namespace: `plugin:${string}`;
  readonly kind: `plugin:${TKind}`;
  readonly payload: unknown;
  readonly phase: TKind;
} => ({
  namespace,
  kind: `plugin:${namespacePhase}` as `plugin:${TKind}`,
  payload,
  phase: namespacePhase as TKind,
});
