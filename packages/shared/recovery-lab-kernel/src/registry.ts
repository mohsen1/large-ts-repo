import { withBrand } from '@shared/core';
import { createDisposableScope } from './iterable';
import type { NoInfer } from '@shared/type-level';
import type {
  PluginContext,
  PluginDefinition,
  PluginKind,
  PluginResult,
} from './traits';
import type { Brand } from '@shared/core';

export type PluginHandle<TKind extends PluginKind> = Brand<string, `PluginHandle:${TKind}`>;
export type RegistryScopeId = Brand<string, 'RegistryScopeId'>;

export interface RegistryConfig<TKind extends PluginKind = PluginKind> {
  readonly scope: RegistryScopeId;
  readonly tags: readonly string[];
  readonly mode: TKind | 'all';
}

export interface RegistryEntry<TPlugin extends PluginDefinition<any, any, any>> {
  readonly key: PluginHandle<TPlugin['kind']>;
  readonly plugin: TPlugin;
  readonly tenant: string;
  readonly active: boolean;
  readonly registeredAt: number;
}

export interface RegisteredPlugin<TPlugin extends PluginDefinition<any, any, any>> {
  readonly plugin: TPlugin;
  unregister(): void;
}

export interface PluginSnapshot {
  readonly scope: RegistryScopeId;
  readonly total: number;
  readonly enabled: boolean;
}

const toHandle = <TKind extends PluginKind>(id: string): PluginHandle<TKind> =>
  withBrand(`${id}`, `PluginHandle:${id.split(':')[0]}` as `PluginHandle:${TKind}`);

export class PluginRegistry {
  readonly #entries = new Map<string, RegistryEntry<PluginDefinition<any, any, any>>>();
  readonly #scope: RegistryScopeId;
  readonly #tags: ReadonlySet<string>;

  public constructor(
    private readonly context: PluginContext,
    config: RegistryConfig,
  ) {
    this.#scope = config.scope;
    this.#tags = new Set(config.tags);
  }

  public get scope(): RegistryScopeId {
    return this.#scope;
  }

  public register<
    TKind extends PluginKind,
    TInput,
    TOutput,
    TPlugin extends PluginDefinition<TInput, TOutput, TKind>,
  >(
    plugin: NoInfer<TPlugin>,
  ): RegisteredPlugin<TPlugin> {
    const key = `${plugin.id}` as PluginHandle<TPlugin['kind']>;
    const handle = toHandle<TPlugin['kind']>(`${this.context.traceId}:${key}`);
    const now = Date.now();

    this.#entries.set(handle, {
      key: handle,
      plugin,
      tenant: this.context.tenant,
      active: true,
      registeredAt: now,
    });

    return {
      plugin,
      unregister: () => {
        this.#entries.delete(handle);
      },
    };
  }

  public list(): readonly RegistryEntry<PluginDefinition<any, any, any>>[] {
    return [...this.#entries.values()].toSorted((left, right) => left.registeredAt - right.registeredAt);
  }

  public async run<TInput, TOutput>(
    entry: RegistryEntry<PluginDefinition<TInput, TOutput, PluginKind>>,
    payload: unknown,
  ): Promise<PluginResult<TOutput>> {
    const startedAt = Date.now();
    try {
      const parsedInput = entry.plugin.schema.parse(payload) as TInput;
      const output = await Promise.resolve(entry.plugin.run(parsedInput, this.context) as TOutput);
      return { ok: true, output: output as TOutput };
    } catch (error) {
      const finishedAt = Date.now();
      return {
        ok: false,
        message: `${entry.plugin.kind}:${entry.plugin.id}@${this.context.tenant}:${finishedAt - startedAt}ms ${String(error)}`,
      };
    }
  }

  public snapshot(): PluginSnapshot {
    const enabled = [...this.#tags].some((tag) => tag.length > 0);
    return {
      scope: this.#scope,
      total: this.#entries.size,
      enabled,
    };
  }

  public [Symbol.dispose](): void {
    this.#entries.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await using scope = createDisposableScope();
    scope.defer(() => {
      this.#entries.clear();
    });
  }

  public static snapshot(scope: RegistryScopeId, entries: ReadonlyMap<string, RegistryEntry<PluginDefinition<any, any, any>>>): PluginSnapshot {
    const enabled = entries.size > 0;
    return {
      scope,
      total: entries.size,
      enabled,
    };
  }
}

export const createRegistry = (context: PluginContext): PluginRegistry => {
  const tenant = context.tenant.trim() || 'tenant-unknown';
  const scope = withBrand(`scope:${tenant}:${context.traceId}`, 'RegistryScopeId') as RegistryScopeId;
  return new PluginRegistry(context, {
    scope,
    tags: [tenant, context.correlationKey],
    mode: 'all',
  });
};
