import type { MeshExecutionPhase, MeshNode, MeshPlan } from './types';
import type { MeshPluginDefinition, PluginByCategory, PluginChainInput, PluginNames, PluginOfName } from './plugin';

type StackLike = {
  use<T extends { [Symbol.asyncDispose](): Promise<void> }>(resource: T): T;
  adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type MaybeStackCtor = { new (): StackLike };
type AsyncStackCtor = MaybeStackCtor;

const asyncStackCtor = (): AsyncStackCtor => {
  const candidate = (globalThis as unknown as { AsyncDisposableStack?: MaybeStackCtor }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }
  return class FallbackStack implements StackLike {
    #cleanup: Array<() => Promise<void> | void> = [];

    use<T extends { [Symbol.asyncDispose](): Promise<void> }>(resource: T): T {
      this.adopt(resource, () => resource[Symbol.asyncDispose]());
      return resource;
    }

    adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.#cleanup.push(() => onDispose(resource));
      return resource;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#cleanup.length - 1; index >= 0; index -= 1) {
        await this.#cleanup[index]?.();
      }
    }
  };
};

const StackCtor = asyncStackCtor();
type MeshPluginRegistryDisposer = { [Symbol.asyncDispose](): Promise<void> };

type PluginFilter<TPlugins extends readonly MeshPluginDefinition[]> = (candidate: TPlugins[number]) => boolean;

export interface PluginLookup<TPlugins extends readonly MeshPluginDefinition[]> {
  has<Name extends PluginNames<TPlugins>>(name: Name): boolean;
  get<Name extends PluginNames<TPlugins>>(name: Name): PluginOfName<TPlugins, Name>;
}

export interface PluginStore<TPlugins extends readonly MeshPluginDefinition[]> extends MeshPluginRegistryDisposer, PluginLookup<TPlugins> {
  readonly phase: MeshExecutionPhase;
  add<TPlugin extends TPlugins[number]>(plugin: TPlugin): void;
  remove<Name extends PluginNames<TPlugins>>(name: Name): void;
  list(): readonly TPlugins[number][];
  listByCategory<TCategory extends string>(category: TCategory): readonly PluginByCategory<TPlugins, TCategory>[];
  filtered<TFilter extends PluginFilter<TPlugins>>(filter: TFilter): readonly TPlugins[number][];
}

type RegistryTopologySeed = readonly {
  readonly phase: MeshExecutionPhase;
  readonly node: MeshNode;
}[];

export const normalizeSeed = (seed: RegistryTopologySeed): RegistryTopologySeed =>
  [...seed].sort((left, right) => left.node.health - right.node.health);

export class MeshPluginRegistry<TPlugins extends readonly MeshPluginDefinition[] = readonly MeshPluginDefinition[]> {
  readonly #byName = new Map<string, TPlugins[number]>();
  readonly #byPhase = new Map<MeshExecutionPhase, Set<string>>();
  readonly #byCategory = new Map<string, Set<string>>();
  readonly #phase: MeshExecutionPhase;
  readonly #stack;

  constructor(phase: MeshExecutionPhase) {
    this.#phase = phase;
    this.#stack = new StackCtor();
  }

  static from<TPlugins extends readonly MeshPluginDefinition[]>(phase: MeshExecutionPhase): MeshPluginRegistry<TPlugins> {
    return new MeshPluginRegistry<TPlugins>(phase);
  }

  get phase(): MeshExecutionPhase {
    return this.#phase;
  }

  add<TPlugin extends TPlugins[number]>(plugin: TPlugin): void {
    this.#byName.set(plugin.manifest.name, plugin);
    const phaseSet = this.#byPhase.get(plugin.phase) ?? new Set<string>();
    phaseSet.add(plugin.manifest.name);
    this.#byPhase.set(plugin.phase, phaseSet);
    const categorySet = this.#byCategory.get(plugin.manifest.category) ?? new Set<string>();
    categorySet.add(plugin.manifest.name);
    this.#byCategory.set(plugin.manifest.category, categorySet);
    this.#stack.adopt(plugin, async () => Promise.resolve());
  }

  remove<Name extends PluginNames<TPlugins>>(name: Name): void {
    const removed = this.#byName.get(name as string);
    if (!removed) {
      return;
    }
    this.#byName.delete(name as string);
    const phaseSet = this.#byPhase.get(removed.phase);
    phaseSet?.delete(name as string);
    const categorySet = this.#byCategory.get(removed.manifest.category);
    categorySet?.delete(name as string);
  }

  has<Name extends PluginNames<TPlugins>>(name: Name): boolean {
    return this.#byName.has(name as string);
  }

  get<Name extends PluginNames<TPlugins>>(name: Name): PluginOfName<TPlugins, Name> {
    return this.#byName.get(name as string) as PluginOfName<TPlugins, Name>;
  }

  list(): readonly TPlugins[number][] {
    return [...this.#byName.values()] as TPlugins[number][];
  }

  listByCategory<TCategory extends string>(category: TCategory): readonly PluginByCategory<TPlugins, TCategory>[] {
    const names = [...(this.#byCategory.get(category) ?? new Set())];
    return names
      .map((name) => this.#byName.get(name) as PluginByCategory<TPlugins, TCategory> | undefined)
      .filter((plugin): plugin is PluginByCategory<TPlugins, TCategory> => plugin !== undefined);
  }

  filtered<TFilter extends PluginFilter<TPlugins>>(filter: TFilter): readonly TPlugins[number][] {
    return this.list().filter((candidate) => filter(candidate as TPlugins[number]));
  }

  forPhase(phase: MeshExecutionPhase): readonly TPlugins[number][] {
    const names = [...(this.#byPhase.get(phase) ?? new Set())];
    return names.map((name) => this.#byName.get(name) as TPlugins[number]);
  }

  async snapshot(): Promise<readonly MeshNode[]> {
    const plan: RegistryTopologySeed = [];
    return plan.map((entry) => entry.node);
  }

  async chainForIntent<TIntent>(intent: TIntent, ordered?: readonly MeshExecutionPhase[]): Promise<PluginChainInput<TPlugins>[]> {
    const phases = ordered ?? [this.#phase];
    const chain = phases.flatMap((phase) => this.forPhase(phase).map((plugin) => ({ plugin: plugin.manifest.name, input: plugin.manifest.enabledByDefault ? intent as never : intent as never })));
    return chain as unknown as PluginChainInput<TPlugins>[];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }
}

export const isRegistryEmpty = <TPlugins extends readonly MeshPluginDefinition[]>(registry: MeshPluginRegistry<TPlugins>): boolean =>
  registry.list().length === 0;

export const toPluginNames = <TPlugins extends readonly MeshPluginDefinition[]>(registry: MeshPluginRegistry<TPlugins>): PluginNames<TPlugins>[] =>
  registry.list().map((plugin) => plugin.manifest.name as PluginNames<TPlugins>);

export type ExecutionPlan<TPlugins extends readonly MeshPluginDefinition[]> = {
  readonly runId: string;
  readonly plans: PluginChainInput<TPlugins>[];
};

export const createExecutionPlan = <TPlugins extends readonly MeshPluginDefinition[]>({
  runId,
  plugins,
}: {
  runId: string;
  plugins: readonly TPlugins[number][];
  }): ExecutionPlan<TPlugins> => {
  const plans = plugins.map((plugin) => ({
    plugin: plugin.manifest.name,
    input: plugin.manifest.enabledByDefault ? true : false,
  })) as unknown as PluginChainInput<TPlugins>[];
  return { runId, plans };
};
