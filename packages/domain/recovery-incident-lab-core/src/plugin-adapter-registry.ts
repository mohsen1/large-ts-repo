import { Brand, withBrand } from '@shared/core';
import type { PluginManifest, PluginKind, PluginRoute } from './plugin-contracts';

export const registryModes = ['single', 'multi', 'broadcast', 'fallback'] as const;
export type RegistryMode = (typeof registryModes)[number];

export type RegistryId = Brand<string, 'PluginAdapterRegistryId'>;
export type RegistrySlot<TKind extends PluginKind = PluginKind> = Brand<`${TKind}:slot`, 'PluginAdapterSlot'>;

export type AdapterPayload<T = unknown> = Record<string, T>;
export interface AdapterContext {
  readonly tenantId: string;
  readonly namespace: string;
  readonly route: PluginRoute;
  readonly mode: RegistryMode;
  readonly startedAt: string;
}

export type AdapterOutput<TOutput> = {
  readonly ok: boolean;
  readonly output: TOutput;
  readonly warnings: readonly string[];
};

export interface AdapterDefinition<
  TKind extends PluginKind = PluginKind,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly id: RegistrySlot<TKind>;
  readonly manifest: PluginManifest<TKind>;
  readonly mode: RegistryMode;
  readonly execute: (context: AdapterContext, input: TInput) => Promise<AdapterOutput<TOutput>>;
}

export type AdapterByKind<
  TDefs extends readonly AdapterDefinition[],
  TKind extends PluginKind = PluginKind,
> = TDefs[number] extends infer Candidate
  ? Candidate extends AdapterDefinition<TKind, infer TInput, infer TOutput>
    ? { input: TInput; output: TOutput; kind: TKind }
    : never
  : never;

type InferredSlots<T extends readonly AdapterDefinition[]> = {
  [D in keyof T]: T[D] extends AdapterDefinition<infer K> ? RegistrySlot<K> : never;
}[number];

export type AdapterManifestMap<TDefinitions extends readonly AdapterDefinition[]> = {
  [D in InferredSlots<TDefinitions> as `${D & string}:manifest`]: PluginManifest;
};

export class PluginAdapterRegistry<TDefinitions extends readonly AdapterDefinition[] = readonly AdapterDefinition[]> {
  readonly #id: RegistryId;
  readonly #slots: Map<string, AdapterDefinition<PluginKind, unknown, unknown>>;
  readonly #modes = new Set<RegistryMode>(registryModes);
  readonly #timeline: readonly string[] = [];

  constructor(id: string) {
    this.#id = withBrand(id, 'PluginAdapterRegistryId');
    this.#slots = new Map();
  }

  get id(): RegistryId {
    return this.#id;
  }

  withMode(mode: RegistryMode): this {
    this.#modes.add(mode);
    return this;
  }

  register<TKind extends PluginKind, TInput, TOutput>(
    definition: AdapterDefinition<TKind, TInput, TOutput>,
  ): this {
    const next = [...this.#modes];
    const mode = definition.mode;
    if (!next.includes(mode)) {
      throw new Error(`unknown mode: ${mode}`);
    }

    const slot = `${definition.id}` as string;
    if (this.#slots.has(slot)) {
      throw new Error(`adapter already exists: ${String(definition.id)}`);
    }

    this.#slots.set(slot, definition as AdapterDefinition<PluginKind, unknown, unknown>);
    return this;
  }

  replace<TKind extends PluginKind, TInput, TOutput>(
    definition: AdapterDefinition<TKind, TInput, TOutput>,
  ): void {
    this.#slots.set(`${definition.id}`, definition as AdapterDefinition<PluginKind, unknown, unknown>);
  }

  has(id: RegistrySlot): boolean {
    return this.#slots.has(`${id}`);
  }

  get<TKind extends PluginKind, TInput = unknown, TOutput = unknown>(id: RegistrySlot<TKind>): AdapterDefinition<TKind, TInput, TOutput> | undefined {
    return this.#slots.get(`${id}`) as AdapterDefinition<TKind, TInput, TOutput> | undefined;
  }

  listKinds(): readonly PluginKind[] {
    return [...new Set([...this.#slots.values()].map((entry) => entry.manifest.kind))];
  }

  listSlots(): readonly RegistrySlot[] {
    return [...this.#slots.keys()] as RegistrySlot[];
  }

  async execute<TKind extends PluginKind, TInput, TOutput>(
    id: RegistrySlot<TKind>,
    context: AdapterContext,
    input: TInput,
  ): Promise<AdapterOutput<TOutput>> {
    const adapter = this.get<TKind, TInput, TOutput>(id);
    if (!adapter) {
      return {
        ok: false,
        output: {} as TOutput,
        warnings: ['missing adapter'],
      };
    }

    if (adapter.mode !== context.mode && adapter.mode !== 'fallback' && context.mode !== 'fallback') {
      return {
        ok: false,
        output: {} as TOutput,
        warnings: [`mode mismatch: ${adapter.mode} !== ${context.mode}`],
      };
    }

    const result = await adapter.execute(context, input);
    return result;
  }

  snapshot() {
    return {
      registryId: this.#id,
      slots: this.listSlots().map((slot) => `${String(slot)}`),
      modes: [...this.#modes],
      timestamps: this.#timeline,
      count: this.#slots.size,
    };
  }
}

export const createRegistry = (id: string): PluginAdapterRegistry => new PluginAdapterRegistry(id);
