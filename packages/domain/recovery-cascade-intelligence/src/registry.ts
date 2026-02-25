import type {
  CascadeBlueprint,
  PolicyRuntimeConfig,
  PolicyId,
  RegistryEventKind,
  StageDependencyTag,
  StageName,
  StageNameFromManifest,
  RegistryTag,
} from './types.js';

export type RegistryKey<TName extends string = string> = `${TName}.registry`;

export interface RegistryFilter {
  readonly stage?: StageName;
  readonly minWeight?: number;
  readonly labels?: readonly string[];
}

export interface RegistryEvent<TBlueprint extends CascadeBlueprint> {
  readonly kind: RegistryEventKind;
  readonly blueprint: TBlueprint;
  readonly policyId: PolicyId;
  readonly timestamp: string;
}

export interface RegistrySnapshot<TBlueprint extends CascadeBlueprint> {
  readonly namespace: TBlueprint['namespace'];
  readonly policyIds: readonly TBlueprint['policyId'][];
  readonly tags: readonly RegistryTag[];
  readonly events: readonly RegistryEvent<TBlueprint>[];
}

export interface RegistryAdapter<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly id: PolicyId;
  readonly blueprint: TBlueprint;
  readonly configure: (config: PolicyRuntimeConfig) => RegistryAdapter<TBlueprint>;
  readonly isEnabled: (filter?: RegistryFilter) => boolean;
}

interface RegistryItem<TBlueprint extends CascadeBlueprint> {
  readonly adapter: RegistryAdapter<TBlueprint>;
  readonly tags: Set<RegistryTag>;
  readonly enabled: boolean;
  readonly createdAt: string;
}

class RegistryEventStack<TBlueprint extends CascadeBlueprint> {
  readonly #events: RegistryEvent<TBlueprint>[] = [];

  public record(event: RegistryEvent<TBlueprint>): void {
    this.#events.push(event);
  }

  public read(): readonly RegistryEvent<TBlueprint>[] {
    return [...this.#events];
  }

  public clear(): void {
    this.#events.length = 0;
  }

  public [Symbol.dispose](): void {
    this.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve();
    this.clear();
  }
}

export interface PluginView<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly policyId: PolicyId;
  readonly stageCount: number;
  readonly enabled: boolean;
  readonly namespace: TBlueprint['namespace'];
  readonly labels: readonly RegistryTag[];
}

export type RegistrySpan<TBlueprint extends CascadeBlueprint = CascadeBlueprint> = {
  readonly from: StageNameFromManifest<TBlueprint>;
  readonly to: StageNameFromManifest<TBlueprint>;
};

export class CascadeIntelligenceRegistry<TBlueprint extends CascadeBlueprint> implements Iterable<RegistryAdapter<TBlueprint>> {
  readonly #namespace: TBlueprint['namespace'];
  readonly #store = new Map<PolicyId, RegistryItem<TBlueprint>>();
  readonly #events = new RegistryEventStack<TBlueprint>();
  readonly #createdAt = new Date().toISOString();
  readonly #order: PolicyId[] = [];

  public constructor(namespace: TBlueprint['namespace']) {
    this.#namespace = namespace;
  }

  public register(adapter: RegistryAdapter<TBlueprint>): this {
    const configured = adapter.configure({
      enableDebug: true,
      maxParallelism: 1,
      timeoutMs: 1_000,
      labels: ['registry'],
    });

    this.#store.set(configured.id, {
      adapter: configured,
      tags: new Set<RegistryTag>([`registry:${String(configured.id)}`]),
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    this.#order.push(configured.id);
    this.#events.record({
      kind: 'register',
      blueprint: configured.blueprint,
      policyId: configured.id,
      timestamp: new Date().toISOString(),
    });

    return this;
  }

  public activate(policyId: PolicyId): void {
    const entry = this.#store.get(policyId);
    if (!entry) {
      return;
    }

    this.#store.set(policyId, { ...entry, enabled: true });
    this.#events.record({
      kind: 'activate',
      blueprint: entry.adapter.blueprint,
      policyId,
      timestamp: new Date().toISOString(),
    });
  }

  public deactivate(policyId: PolicyId): void {
    const entry = this.#store.get(policyId);
    if (!entry) {
      return;
    }

    this.#store.set(policyId, { ...entry, enabled: false });
    this.#events.record({
      kind: 'deactivate',
      blueprint: entry.adapter.blueprint,
      policyId,
      timestamp: new Date().toISOString(),
    });
  }

  public remove(policyId: PolicyId): void {
    const entry = this.#store.get(policyId);
    if (!entry) {
      return;
    }

    this.#store.delete(policyId);
    this.#order.splice(this.#order.indexOf(policyId), 1);
    this.#events.record({
      kind: 'remove',
      blueprint: entry.adapter.blueprint,
      policyId,
      timestamp: new Date().toISOString(),
    });
  }

  public has(policyId: PolicyId): boolean {
    return this.#store.has(policyId);
  }

  public get(policyId: PolicyId): RegistryAdapter<TBlueprint> | undefined {
    return this.#store.get(policyId)?.adapter;
  }

  public keys(): readonly PolicyId[] {
    return [...this.#order];
  }

  public values(): readonly RegistryAdapter<TBlueprint>[] {
    return this.#order.map((policyId) => {
      const entry = this.#store.get(policyId);
      if (entry === undefined) {
        throw new Error(`registry.missing:${policyId}`);
      }
      return entry.adapter;
    });
  }

  public filter(filter: RegistryFilter): readonly RegistryAdapter<TBlueprint>[] {
    return [...this.#store.values()].map((entry) => entry.adapter).filter((adapter) => {
      const adapterTags = [...this.#store.get(adapter.id)?.tags ?? []].map((tag) => tag.replace(/^registry:/, ''));

      if (filter.minWeight !== undefined) {
        const maxWeight = Math.max(...adapter.blueprint.stages.map((stage) => Number(stage.weight) || 0));
        if (maxWeight < filter.minWeight) {
          return false;
        }
      }

      if (filter.labels !== undefined && filter.labels.length > 0) {
        const activeLabels = adapterTags;
        if (!filter.labels.every((label) => activeLabels.includes(label))) {
          return false;
        }
      }

      if (filter.stage !== undefined) {
        const found = adapter.blueprint.stages.some(
          (stage) => stage.name === filter.stage || stage.dependencies.some((dependency) => dependency.includes(filter.stage ?? '')),
        );
        if (!found) {
          return false;
        }
      }

      return adapter.isEnabled(filter);
    });
  }

  public snapshot(): RegistrySnapshot<TBlueprint> {
    const tags = [...new Set([...this.#store.values()].flatMap((entry) => [...entry.tags]))];
    return {
      namespace: this.#namespace,
      policyIds: this.keys(),
      tags,
      events: this.#events.read(),
    };
  }

  public configure(policyId: PolicyId, config: PolicyRuntimeConfig): RegistryAdapter<TBlueprint> | undefined {
    const entry = this.#store.get(policyId);
    if (!entry) {
      return undefined;
    }

    const configured = entry.adapter.configure(config);
    this.#store.set(policyId, { ...entry, adapter: configured, createdAt: new Date().toISOString() });
    return configured;
  }

  public stageCoverage(): Readonly<Record<StageNameFromManifest<TBlueprint>, number>> {
    const output: Partial<Record<StageNameFromManifest<TBlueprint>, number>> = {};
    for (const entry of this.#store.values()) {
      for (const stage of entry.adapter.blueprint.stages) {
        const key = stage.name as StageNameFromManifest<TBlueprint>;
        output[key] = (output[key] ?? 0) + (entry.enabled ? 1 : 0);
      }
    }
    return output as Readonly<Record<StageNameFromManifest<TBlueprint>, number>>;
  }

  public pluginViews(): readonly PluginView<TBlueprint>[] {
    return this.values().map((adapter) => ({
      policyId: adapter.id,
      stageCount: adapter.blueprint.stages.length,
      enabled: this.has(adapter.id),
      namespace: adapter.blueprint.namespace,
      labels: ['registry:active', ...(Array.from(this.#store.get(adapter.id)?.tags ?? []))],
    }));
  }

  public [Symbol.iterator](): IterableIterator<RegistryAdapter<TBlueprint>> {
    return this.values().values();
  }

  public [Symbol.dispose](): void {
    this.#events[Symbol.dispose]();
    this.#store.clear();
    this.#order.length = 0;
  }
}

export const createRegistry = <TBlueprint extends CascadeBlueprint>(namespace: TBlueprint['namespace']): CascadeIntelligenceRegistry<TBlueprint> =>
  new CascadeIntelligenceRegistry(namespace);

export const collectStages = <TBlueprint extends CascadeBlueprint>(
  registry: CascadeIntelligenceRegistry<TBlueprint>,
): readonly StageDependencyTag[] =>
  registry
    .values()
    .flatMap((adapter) => adapter.blueprint.stages.flatMap((stage) => stage.dependencies));

export const isAdapterActive = <TBlueprint extends CascadeBlueprint>(adapter: RegistryAdapter<TBlueprint>): boolean =>
  adapter.isEnabled();

export const groupByTag = <TBlueprint extends CascadeBlueprint>(
  registry: CascadeIntelligenceRegistry<TBlueprint>,
): Readonly<Record<RegistryTag, readonly PolicyId[]>> => {
  const output: Record<RegistryTag, PolicyId[]> = {} as Record<RegistryTag, PolicyId[]>;
  for (const id of registry.keys()) {
    const key = `registry:${String(id)}` as RegistryTag;
    output[key] = [id, ...(output[key] ?? [])];
  }
  return output;
};

export const mapByDependencyLayer = <TBlueprint extends CascadeBlueprint>(
  registry: CascadeIntelligenceRegistry<TBlueprint>,
): Readonly<Record<StageDependencyTag, number>> =>
  Object.fromEntries(
    collectStages(registry).map((dependency) => [dependency, dependency.length]),
  ) as Readonly<Record<StageDependencyTag, number>>;

export const normalizeStageDependency = (dependency: StageName | StageDependencyTag): StageDependencyTag =>
  dependency.startsWith('dep:') ? (dependency as StageDependencyTag) : (`dep:${dependency}` as StageDependencyTag);
