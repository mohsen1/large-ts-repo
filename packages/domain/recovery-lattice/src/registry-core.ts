import { withBrand } from '@shared/core';
import { NoInfer, KeyPaths, PathValue } from '@shared/type-level';
import { asRouteId, type LatticeRouteId, type LatticeTenantId, asTenantId } from './ids';
import type { LatticeBlueprintManifest, StepPayloadByKind } from './blueprints';
import type { PluginEnvelope, PluginKind } from './plugin';

export type RegistryState = 'idle' | 'bootstrapping' | 'active' | 'frozen' | 'closed';

export interface LatticeRegistryContext {
  readonly tenantId: LatticeTenantId;
  readonly routeId: LatticeRouteId;
  readonly namespace: string;
  readonly createdAt: string;
}

export interface RegistryEnvelope<TState extends string = string> {
  readonly tenantId: LatticeTenantId;
  readonly key: RegistryTag;
  readonly value: TState;
  readonly stamp: string;
}

export type RegistryTag = `tag:${string}`;

export type RegistrySnapshotEntry = {
  readonly key: string;
  readonly value: string;
  readonly kind: PluginKind;
};

export type RegistryStateKey<T> = T extends LatticeBlueprintManifest<infer K>
  ? `${T['steps'][number]['id']}:${K & string}`
  : string;

export type RegistryProjection<TRegistry extends Record<string, unknown>> = {
  [K in keyof TRegistry as `registry:${Extract<K, string>}`]: TRegistry[K];
};

export type RegistryIndex<TItems extends readonly RegistryEnvelope[]> = {
  [K in TItems[number] as K['key']]: K['value'];
};

export interface RegistryRecord<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly label: string;
  readonly tags: readonly RegistryTag[];
  readonly active: readonly (PluginKind | 'validate')[];
  readonly plugins: readonly PluginEnvelope<unknown, unknown, PluginKind>[];
  readonly snapshot: RegistryProjection<TContext>;
}

export interface RegistryEvent {
  readonly at: string;
  readonly type: 'registered' | 'removed' | 'updated' | 'frozen';
  readonly payload: Record<string, string | number | boolean>;
}

type Disposer = { [Symbol.dispose](): void };

type RegistryStack = {
  use<T>(resource: T & { [Symbol.dispose]?: () => void }): T;
  [Symbol.dispose](): void;
};

const getStack = (): { new (): RegistryStack } => {
  const fallback = class {
    readonly #disposers: Array<() => void> = [];

    use<T>(resource: T & { [Symbol.dispose]?: () => void }): T {
      const dispose = resource?.[Symbol.dispose];
      if (typeof dispose === 'function') {
        this.#disposers.push(() => dispose.call(resource));
      }
      return resource;
    }

    [Symbol.dispose](): void {
      while (this.#disposers.length > 0) {
        const last = this.#disposers.pop();
        if (last) {
          last();
        }
      }
    }
  };

  return (
    (globalThis as { DisposableStack?: { new (): RegistryStack } }).DisposableStack ??
    fallback
  );
};

export interface RegistryStats {
  readonly registered: number;
  readonly activeKinds: readonly (PluginKind | 'validate')[];
  readonly lastEvent?: RegistryEvent;
}

export interface RegistryContract<TBlueprint extends LatticeBlueprintManifest> {
  readonly tenantId: LatticeTenantId;
  readonly blueprint: TBlueprint;
  readonly state: RegistryState;
  readonly updatedAt: string;
}

const stateTag = (tenantId: LatticeTenantId, kind: string): RegistryTag =>
  `tag:${tenantId}:${kind}` as RegistryTag;

export class LatticeServiceRegistry {
  readonly #records = new Map<string, RegistryRecord>();
  readonly #events: RegistryEvent[] = [];
  readonly #namespace: string;
  #state: RegistryState = 'idle';

  public constructor(
    private readonly tenantId: LatticeTenantId,
    namespace: string,
    private readonly plugins: readonly PluginEnvelope<unknown, unknown, PluginKind>[],
  ) {
    this.#namespace = namespace;
    this.#state = 'active';
  }

  public get state(): RegistryState {
    return this.#state;
  }

  public get count(): number {
    return this.#records.size;
  }

  public listByKind<TKind extends PluginKind>(kind: TKind): readonly PluginEnvelope<unknown, unknown, TKind>[] {
    const entries = this.#registryEntries();
    return entries.filter((entry): entry is PluginEnvelope<unknown, unknown, TKind> => entry.kind === kind);
  }

  public applyPathFilter<TContext extends Record<string, unknown>>(
    context: TContext,
    path: KeyPaths<TContext> | string,
  ): string[] {
    const entries = [...this.#events];
    const selected = entries.filter((entry) => String(entry.type).includes(String(path)));
    return selected.map((entry) => `${entry.type}::${entry.at}`);
  }

  public resolveValues<TContext, TPath extends string>(
    context: TContext,
    path: NoInfer<TPath>,
  ): PathValue<TContext, TPath & string>[] {
    const value = context as Record<string, unknown>;
    if (typeof path !== 'string' || typeof value !== 'object' || value === null) return [];
    const resolved = path
      .split('.')
      .reduce<unknown>((acc, segment) => {
        if (acc === null || acc === undefined) return undefined;
        if (typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[segment];
      }, value);
    return resolved === undefined ? [] : [resolved as PathValue<TContext, TPath & string>];
  }

  public openBlueprint<TBlueprint extends LatticeBlueprintManifest>(
    blueprint: TBlueprint,
  ): RegistryContract<TBlueprint> {
    const route = asRouteId(`route:${blueprint.route}`);
    const tag = stateTag(this.tenantId, `${route}`);
    this.#events.push({
      at: new Date().toISOString(),
      type: 'registered',
      payload: {
        tenant: `${this.tenantId}`,
        blueprint: `${blueprint.name}`,
        route: `${route}`,
      },
    });

    const snapshot = this.#snapshotRecord(blueprint);
    this.#records.set(`${this.tenantId}:${blueprint.blueprintId}`, {
      id: `${this.tenantId}:${blueprint.blueprintId}`,
      label: blueprint.name,
      tags: [tag],
      active: blueprint.steps.map((step) => step.kind),
      plugins: [...this.plugins],
      snapshot,
    });

    return {
      tenantId: this.tenantId,
      blueprint,
      state: this.#state,
      updatedAt: new Date().toISOString(),
    };
  }

  public closeBlueprint<TBlueprint extends LatticeBlueprintManifest>(
    blueprint: TBlueprint,
  ): RegistryContract<TBlueprint> | null {
    const key = `${this.tenantId}:${blueprint.blueprintId}`;
    if (!this.#records.has(key)) return null;

    this.#records.delete(key);
    this.#events.push({
      at: new Date().toISOString(),
      type: 'removed',
      payload: {
        tenant: `${this.tenantId}`,
        blueprint: `${blueprint.name}`,
      },
    });

    return {
      tenantId: this.tenantId,
      blueprint,
      state: this.#state,
      updatedAt: new Date().toISOString(),
    };
  }

  public freeze(): void {
    this.#state = 'frozen';
    this.#events.push({
      at: new Date().toISOString(),
      type: 'frozen',
      payload: {
        tenant: `${this.tenantId}`,
        namespace: this.#namespace,
      },
    });
  }

  public stats(): RegistryStats {
    const active = [...this.#records.values()].flatMap((record) => record.active);
    const activeKinds = [...new Set(active)] as readonly (PluginKind | 'validate')[];
    return {
      registered: this.#records.size,
      activeKinds,
      lastEvent: this.#events[this.#events.length - 1],
    };
  }

  public toArray(): readonly RegistryRecord[] {
    return [...this.#records.values()];
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    const Disposable = getStack();
    const asyncDisposer = {
      [Symbol.dispose](): void {
        clear();
      },
    } satisfies Disposer;
    const stack = new Disposable();
    const clear = () => {
      this.#clearRecords();
    };
    await using _ = stack;
    stack.use(asyncDisposer);
  }

  #clearRecords(): void {
    this.#records.clear();
    this.#events.length = 0;
  }

  #registryEntries(): readonly PluginEnvelope<unknown, unknown, PluginKind>[] {
    return [...this.plugins];
  }

  #snapshotRecord<TBlueprint extends LatticeBlueprintManifest>(
    blueprint: TBlueprint,
  ): RegistryProjection<{
    blueprint: TBlueprint;
    steps: readonly StepPayloadByKind<TBlueprint, TBlueprint['steps'][number]['kind']>[];
  }> {
    const context = {
      blueprint: blueprint.name,
      tenant: `${this.tenantId}`,
      route: `${asRouteId(`route:${blueprint.route}`)}`,
      namespace: this.#namespace,
      pluginCount: this.plugins.length,
    };

    const steps = blueprint.steps.map((step) => step.target) as unknown as readonly StepPayloadByKind<
      TBlueprint,
      TBlueprint['steps'][number]['kind']
    >[];

    return {
      blueprint,
      steps,
      'registry:tenant': this.tenantId,
      'registry:namespace': this.#namespace,
      'registry:blueprint': blueprint,
      'registry:route': asRouteId(blueprint.route),
      'registry:plugins': this.plugins.length,
      'registry:context': context,
      'registry:steps': steps,
    } as RegistryProjection<{
      blueprint: TBlueprint;
      steps: readonly StepPayloadByKind<TBlueprint, TBlueprint['steps'][number]['kind']>[];
    }>;
  }
}


export const createRegistryState = (tenantId: string, namespace: string): LatticeRegistryContext => ({
  tenantId: asTenantId(tenantId),
  routeId: asRouteId(`route:${tenantId}:registry:${namespace}`),
  namespace,
  createdAt: new Date().toISOString(),
});

export const isFrozen = (registry: LatticeServiceRegistry): boolean => registry.state === 'frozen';
