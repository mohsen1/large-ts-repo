import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import {
  pluginCatalogSchema,
  chaosWorkspaceSchema,
  type ChaosPluginCatalog,
  type ChaosPluginKind,
  type PluginCatalogSchema,
  type PluginDescriptor,
  type PluginInput,
  type PluginOutput,
  type ChaosTenantId,
  type ChaosWorkspaceId,
} from './types';

export interface PluginFactoryContext {
  readonly plugin: ChaosPluginKind;
  readonly traceId: string;
  readonly tenant: ChaosTenantId;
  readonly workspace: ChaosWorkspaceId;
}

export interface PluginInstance<TInput, TOutput> {
  readonly id: string;
  readonly namespace: string;
  readonly input: TInput;
  readonly execute: (input: NoInfer<TInput>, context: PluginFactoryContext) => Promise<Result<TOutput>>;
  readonly dependencies: readonly string[];
  readonly output?: TOutput;
}

export interface PluginDescriptorRecord<
  TKind extends string = string,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly kind: TKind;
  readonly namespace: string;
  readonly inputSchema: {
    parse: (value: unknown) => TInput;
  };
  readonly outputSchema: {
    parse: (value: unknown) => TOutput;
  };
  readonly dependencies?: readonly string[];
  readonly factory: (
    context: PluginFactoryContext,
    input: TInput,
  ) => PluginInstance<TInput, TOutput>;
}

export type RegistryTuple<T = PluginDescriptorRecord> = readonly T[];

export type KeyedPlugin<T extends readonly PluginDescriptorRecord[]> = {
  [K in T[number] as K['kind']]: K;
};

export type PluginInputOf<TCatalog extends readonly PluginDescriptorRecord[], K extends string> =
  Extract<TCatalog[number], { kind: K }> extends PluginDescriptorRecord<string, infer TInput>
    ? TInput
    : unknown;

export type PluginOutputOf<TCatalog extends readonly PluginDescriptorRecord[], K extends string> =
  Extract<TCatalog[number], { kind: K }> extends PluginDescriptorRecord<string, unknown, infer TOutput>
    ? TOutput
    : unknown;

export type PluginLookup<TCatalog extends readonly PluginDescriptorRecord[]> = {
  [K in keyof KeyedPlugin<TCatalog> & string]: PluginDescriptorRecord<
    K,
    PluginInputOf<TCatalog, K>,
    PluginOutputOf<TCatalog, K>
  >;
};

export interface TypedRegistry<TCatalog extends readonly PluginDescriptorRecord[]> {
  register: <K extends PluginDescriptorRecord>(
    input: K,
    position?: number
  ) => TypedRegistry<readonly [...TCatalog, K]>;

  resolve<K extends string>(
    kind: K,
    input: PluginInputOf<TCatalog, K>
  ): Promise<Result<unknown>>;

  snapshot(): readonly {
    readonly kind: keyof KeyedPlugin<TCatalog> & string;
    readonly namespace: string;
    readonly dependencies: readonly string[];
  }[];

  [Symbol.iterator](): IterableIterator<{
    readonly kind: keyof KeyedPlugin<TCatalog> & string;
    readonly namespace: string;
  }>;
}

export interface RegistryMetrics {
  readonly size: number;
  readonly namespaces: readonly string[];
  readonly kinds: readonly string[];
}

interface RegistryErrorState {
  readonly kind: 'duplicate' | 'missing' | 'bad-input' | 'bad-output';
  readonly message: string;
  readonly source: string;
}

function createErrorState(
  kind: RegistryErrorState['kind'],
  source: string,
  message: string
): RegistryErrorState {
  return {
    kind,
    source,
    message
  };
}

function toPluginDescriptor(value: unknown): PluginDescriptorRecord | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const candidate = value as PluginDescriptor;
  if (typeof candidate.name !== 'string' || typeof candidate.namespace !== 'string') {
    return undefined;
  }

  const pluginKind = candidate.name as string;

  return {
    kind: pluginKind,
    namespace: candidate.namespace,
    inputSchema: {
      parse: (input) => {
        const parsed = candidate.inputSchema;
        return parsed as unknown as never;
      }
    },
    outputSchema: {
      parse: (value) => value as never
    },
    dependencies: [],
    factory: () => ({
      id: `${candidate.namespace}:${pluginKind}`,
      namespace: candidate.namespace,
      input: {} as never,
      dependencies: [],
      execute: async () => ok({} as never)
    })
  };
}

function normalizePlugins(items: readonly PluginDescriptorRecord[]): PluginDescriptorRecord[] {
  const unique = new Map<string, PluginDescriptorRecord>();
  for (const item of items) {
    const key = `${item.namespace}:${item.kind}`;
    unique.set(key, item);
  }
  return [...unique.values()];
}

function toKind(value: string): ChaosPluginKind {
  return value as unknown as ChaosPluginKind;
}

export function createPluginRegistry<
  TCatalog extends readonly PluginDescriptorRecord[] = readonly PluginDescriptorRecord[]
>(
  ...catalog: NoInfer<TCatalog>
): TypedRegistry<TCatalog> {
  const byKind = new Map<string, PluginDescriptorRecord>();
  const order: string[] = [];
  const diagnostics: RegistryErrorState[] = [];
  const seed = normalizePlugins(catalog);

  for (const item of seed) {
    if (byKind.has(item.kind)) {
      diagnostics.push(createErrorState('duplicate', item.kind, `duplicate plugin kind ${item.kind}`));
      continue;
    }
    byKind.set(item.kind, item);
    order.push(item.kind);
  }

  const register = <K extends PluginDescriptorRecord>(
    input: K,
    position?: number,
  ): TypedRegistry<TCatalog extends readonly PluginDescriptorRecord[] ? readonly [...TCatalog, K] : never> => {
    if (byKind.has(input.kind)) {
      diagnostics.push(createErrorState('duplicate', input.kind, `${input.kind} already registered`));
      return registry as never;
    }
    if (position === 0) {
      order.unshift(input.kind);
    } else if (typeof position === 'number') {
      order.splice(Math.min(position, order.length), 0, input.kind);
    } else {
      order.push(input.kind);
    }
    byKind.set(input.kind, input);
    return registry as never;
  };

  const resolve = async <K extends string>(
    kind: K,
    input: PluginInputOf<TCatalog, K>,
  ): Promise<Result<unknown>> => {
    const descriptor = byKind.get(kind);
    if (!descriptor) {
      return fail(createErrorState('missing', String(kind), `missing plugin ${String(kind)}`) as never);
    }

    const parsedInput = descriptor.inputSchema.parse(input as unknown);
    const context = {
      plugin: toKind(kind),
      traceId: `trace:${kind}:${Date.now()}`,
      tenant: 'tenant:default' as ChaosTenantId,
      workspace: `workspace:${kind}` as never,
    } as PluginFactoryContext;

    const instance = descriptor.factory(context, parsedInput as never);
    const outputRaw = await instance.execute(parsedInput as never, context);
    if (!outputRaw.ok) {
      return fail(outputRaw.error as never);
    }
    const output = descriptor.outputSchema.parse(outputRaw.value);

    return ok({
      ...instance,
      input: parsedInput,
      output
    } as unknown as PluginInstance<PluginInputOf<TCatalog, K>, PluginOutputOf<TCatalog, K>>);
  };

  const snapshot = () =>
    order.map((kind) => ({
      kind: kind as keyof KeyedPlugin<TCatalog> & string,
      namespace: byKind.get(kind)?.namespace ?? 'default',
      dependencies: [...(byKind.get(kind)?.dependencies ?? [])]
    }));

  const registry: TypedRegistry<TCatalog> = {
    register,
    resolve,
    snapshot,
    [Symbol.iterator]: () => {
      return order
        .map((kind) => ({ kind: kind as keyof KeyedPlugin<TCatalog> & string, namespace: byKind.get(kind)?.namespace ?? '' }))
        .values();
    }
  } as TypedRegistry<TCatalog>;

  return registry;
}

export class RegistryInspector<TCatalog extends readonly PluginDescriptorRecord[]> {
  readonly #registry: TypedRegistry<TCatalog>;
  readonly #inputErrors: RegistryErrorState[];

  constructor(registry: TypedRegistry<TCatalog>, inputErrors: RegistryErrorState[] = []) {
    this.#registry = registry;
    this.#inputErrors = [...inputErrors];
  }

  metrics(): RegistryMetrics {
    const entries = [...this.#registry.snapshot()];
    return {
      size: entries.length,
      namespaces: [...new Set(entries.map((entry) => entry.namespace))],
      kinds: entries.map((entry) => entry.kind)
    };
  }

  diagnostics(): readonly RegistryErrorState[] {
    return this.#inputErrors;
  }

  *iterKinds(): Generator<string, void, void> {
    for (const entry of this.#registry.snapshot()) {
      yield entry.kind;
    }
  }
}

export function normalizeCatalog<T extends PluginCatalogSchema>(items: T): readonly PluginDescriptorRecord[] {
  const parsed = pluginCatalogSchema.parse(items);
  const descriptors = parsed
    .map((item) =>
      toPluginDescriptor({
        name: item.name,
        namespace: item.namespace,
        scopes: item.scopes,
        inputSchema: item.inputSchema,
        outputSchema: item.outputSchema
      })
    )
    .filter((value): value is PluginDescriptorRecord => value !== undefined);
  return descriptors;
}

export function isWorkspaceConfig(value: unknown): value is Parameters<typeof chaosWorkspaceSchema.parse>[0] {
  return chaosWorkspaceSchema.safeParse(value).success;
}

export type {
  ChaosPluginCatalog
};

export {
  normalizePlugins,
  toPluginDescriptor,
  pluginCatalogSchema
};
