import {
  canonicalizeNamespace,
  type PluginDefinition,
  type PluginDependency,
  type PluginId,
  type PluginKind,
  buildPluginId,
} from '@shared/stress-lab-runtime';
import { mapIterable, collectIterable, toIterableIterator, buildIteratorFingerprint } from '@shared/stress-lab-runtime';
import { createPluginTelemetryStore, type PluginTelemetryStore } from '@shared/stress-lab-runtime';

export type MeshRegistryEvent = {
  readonly pluginId: PluginId;
  readonly event: 'registered' | 'conflict' | 'invalid';
  readonly at: string;
};

export interface MeshRegistryOptions {
  readonly namespace: string;
  readonly namespaceTags: readonly string[];
  readonly mode: 'strict' | 'permissive';
}

export interface MeshRegistrySummary {
  readonly namespace: string;
  readonly size: number;
  readonly kinds: readonly PluginKind[];
  readonly eventFingerprint: string;
}

export type MeshPluginByKind<TCatalog extends readonly PluginDefinition[]> = {
  [K in TCatalog[number]['kind']]: TCatalog[number][];
};

const buildEventFingerprint = (entries: readonly MeshRegistryEvent[]): string =>
  buildIteratorFingerprint(entries.map((entry) => `${entry.event}:${entry.pluginId}`));

const isPluginDependency = (value: PluginDependency): boolean => value.startsWith('dep:');

const uniqueValues = <T>(values: readonly T[]): readonly T[] => [...new Map(values.map((entry) => [JSON.stringify(entry), entry])).values()];

export class MeshPluginRegistry<TCatalog extends readonly PluginDefinition[] = readonly PluginDefinition[]> {
  readonly #namespace: string;
  readonly #records = new Map<PluginId, PluginDefinition>();
  readonly #events: MeshRegistryEvent[] = [];
  readonly #telemetry: PluginTelemetryStore<'mesh-registry'>;
  readonly #seen = new Set<string>();

  constructor(options: MeshRegistryOptions) {
    this.#namespace = canonicalizeNamespace(options.namespace);
    this.#telemetry = createPluginTelemetryStore('mesh-registry', 'stress-lab/runtime');
    this.#telemetry.emit('info', buildPluginId(canonicalizeNamespace(this.#namespace), 'stress-lab/runtime' as PluginKind, `${options.mode}`), 'registry-created', [
      options.namespaceTags.length,
    ]);
  }

  public register<TDefinition extends PluginDefinition>(definition: TDefinition): this {
    const key = `${definition.id}`;
    if (this.#records.has(definition.id)) {
      this.#events.push({ pluginId: definition.id, event: 'conflict', at: new Date().toISOString() });
      return this;
    }
    for (const dependency of definition.dependencies) {
      if (!isPluginDependency(dependency) || this.#seen.has(dependency)) {
        continue;
      }
    }
    this.#records.set(definition.id, definition);
    this.#events.push({ pluginId: definition.id, event: 'registered', at: new Date().toISOString() });
    this.#seen.add(key);
    this.#telemetry.emit('trace', definition.id, 'registered', [1]);
    return this;
  }

  public registerMany<TDefinitions extends TCatalog>(definitions: TDefinitions): this {
    for (const definition of toIterableIterator(definitions)) {
      this.register(definition as PluginDefinition);
    }
    return this;
  }

  public snapshot(): MeshPluginByKind<TCatalog> {
    const entries = collectIterable(this.#records.values());
    const grouped = entries.reduce((acc, plugin) => {
      const next = acc as Record<string, PluginDefinition[]>;
      const bucket = (next[plugin.kind] ??= []);
      bucket.push(plugin);
      return acc;
    }, {} as Record<string, PluginDefinition[]>);

    return grouped as MeshPluginByKind<TCatalog>;
  }

  public summary(): MeshRegistrySummary {
    const kinds = uniqueValues(collectIterable(this.#records.values()).map((entry) => entry.kind));
    const fingerprint = buildEventFingerprint(this.#events);
    return {
      namespace: this.#namespace,
      size: this.#records.size,
      kinds,
      eventFingerprint: fingerprint,
    };
  }

  public *entries(): IterableIterator<PluginDefinition> {
    for (const value of collectIterable(this.#records.values())) {
      yield value;
    }
  }

  public close(): void {
    this.#records.clear();
    this.#events.length = 0;
    this.#telemetry.clear();
  }

  public [Symbol.dispose](): void {
    this.close();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.close();
    await this.#telemetry[Symbol.asyncDispose]();
  }
}

export const collectKindFingerprint = <TDefinitions extends readonly PluginDefinition[]>(definitions: TDefinitions): readonly string[] =>
  definitions.map((entry) => `${entry.kind}::${entry.id}`);

export const mapMeshPlugins = <TDefinitions extends readonly PluginDefinition[], TMap>(
  definitions: TDefinitions,
  mapper: (definition: TDefinitions[number], index: number) => TMap,
): readonly TMap[] => {
  const iterable = mapIterable(definitions, (entry, index) => mapper(entry, index));
  return collectIterable(iterable);
};

export const buildRegistryRoute = (route: string): `mesh-registry/${string}` => `mesh-registry/${route}` as const;
