import type { Brand } from '@shared/type-level';
import type { NoInfer, PluginMetadata, PluginPayload } from './types';

export type QuantumPhase = 'bootstrap' | 'runtime' | 'scale-down' | 'audit';

export interface QuantumContext<TConfig extends object> {
  readonly tenant: Brand<string, 'tenant-id'>;
  readonly phase: QuantumPhase;
  readonly contextId: Brand<string, 'quantum-context-id'>;
  readonly startedAt: number;
  readonly config: TConfig;
}

export interface QuantumPluginDefinition<
  TKind extends string,
  TConfig extends object,
  TPayload extends object,
> {
  readonly kind: TKind;
  readonly metadata: PluginMetadata<TKind>;
  readonly config: NoInfer<TConfig>;
  build(context: QuantumContext<TConfig>): Promise<PluginPayload<TKind, TPayload>> | PluginPayload<TKind, TPayload>;
}

export type PluginDefinitionMap = Record<string, QuantumPluginDefinition<string, object, object>>;

export type PluginConfig<T extends QuantumPluginDefinition<string, object, object>> = T extends QuantumPluginDefinition<
  string,
  infer C,
  object
>
  ? C
  : never;

export type PluginPayloadOf<
  T extends QuantumPluginDefinition<string, object, object>,
> = T extends QuantumPluginDefinition<string, infer _K, infer P> ? P : never;

export interface RegistrySnapshot<TSpec extends PluginDefinitionMap> {
  readonly count: number;
  readonly kinds: readonly (keyof TSpec & string)[];
  readonly timestamp: number;
}

class ScopedCache {
  readonly #items = new Map<string, PluginPayload<string, object>>();
  readonly #createdAt = Date.now();

  set(kind: string, payload: PluginPayload<string, object>): void {
    this.#items.set(kind, payload);
  }

  get(kind: string): PluginPayload<string, object> | undefined {
    return this.#items.get(kind);
  }

  has(kind: string): boolean {
    return this.#items.has(kind);
  }

  keys(): readonly string[] {
    return [...this.#items.keys()];
  }

  size(): number {
    return this.#items.size;
  }

  toMap() {
    return new Map(this.#items);
  }

  get age(): number {
    return Date.now() - this.#createdAt;
  }
}

export class QuantumPluginRegistry<TSpec extends PluginDefinitionMap> {
  readonly #definitions: Map<keyof TSpec & string, TSpec[keyof TSpec & string]> = new Map<
    keyof TSpec & string,
    TSpec[keyof TSpec & string]
  >();
  readonly #cache = new ScopedCache();
  readonly #createdAt = Date.now();

  constructor(spec: TSpec) {
    for (const [key, value] of Object.entries(spec)) {
      this.#definitions.set(key as keyof TSpec & string, value as TSpec[keyof TSpec & string]);
    }
  }

  has<K extends keyof TSpec & string>(kind: K): boolean {
    return this.#definitions.has(kind);
  }

  register<K extends keyof TSpec & string>(kind: K, factory: TSpec[K]): void {
    if (this.#definitions.has(kind)) {
      throw new Error(`Plugin kind already exists: ${kind}`);
    }
    this.#definitions.set(kind, factory as TSpec[keyof TSpec & string]);
  }

  keys(): readonly (keyof TSpec & string)[] {
    return [...this.#definitions.keys()] as readonly (keyof TSpec & string)[];
  }

  async instantiate<K extends keyof TSpec & string, C extends PluginConfig<TSpec[K]>>(
    kind: K,
    context: Omit<QuantumContext<NoInfer<C>>, 'config'> & { config: C },
  ): Promise<PluginPayloadOf<TSpec[K]> | undefined> {
    const definition = this.#definitions.get(kind);
    if (!definition) {
      return undefined;
    }
    const payload = await definition.build(context);
    this.#cache.set(kind as string, payload as PluginPayload<string, object>);
    return payload as PluginPayloadOf<TSpec[K]>;
  }

  get<K extends keyof TSpec & string>(kind: K): PluginPayloadOf<TSpec[K]> | undefined {
    const payload = this.#cache.get(kind as string);
    if (!payload) {
      return undefined;
    }
    return payload as PluginPayloadOf<TSpec[K]>;
  }

  snapshot(): RegistrySnapshot<TSpec> {
    return {
      count: this.#cache.size(),
      kinds: [...this.keys()].sort(),
      timestamp: this.#createdAt,
    };
  }

  forEach(
    handler: <K extends keyof TSpec & string>(
      kind: K,
      payload: PluginPayloadOf<TSpec[K]>,
      index: number,
    ) => void,
  ): void {
    const map = this.#cache.toMap();
    const entries = [...map.entries()];
    for (let index = 0; index < entries.length; index += 1) {
      const [kind, payload] = entries[index]!;
      handler(kind as keyof TSpec & string, payload as PluginPayloadOf<TSpec[keyof TSpec & string]>, index);
    }
  }
}

export const buildPluginRegistry = <TSpec extends PluginDefinitionMap>(spec: TSpec): QuantumPluginRegistry<TSpec> =>
  new QuantumPluginRegistry(spec);

export const pluginPayloadKinds = <TSpec extends PluginDefinitionMap>(registry: QuantumPluginRegistry<TSpec>): readonly string[] =>
  registry.keys();

export type AnyPluginPayload<TSpec extends PluginDefinitionMap> = PluginPayloadOf<TSpec[keyof TSpec & string]>;
