import { NoInfer } from '@shared/type-level';
import { PluginByKind, PluginChannel, type PluginContext, type PluginEnvelope, type PluginKind, type PluginNameMap, type PluginResult, type PluginStatus } from './plugin';

export type FleetPluginTag<TName extends string = string> = `fleet:${Lowercase<TName>}`;
export type FleetContextKey = 'tenant' | 'route' | 'region' | 'mode';
export type FleetMode = 'idle' | 'warming' | 'ready' | 'active' | 'closed';
export type FleetLifecycle<T extends FleetMode = FleetMode> = { readonly state: T };

export type FleetChannel<TKind extends PluginKind = PluginKind> = `${TKind}::${string}`;
export type FleetScope = `scope:${FleetMode}`;
export type FleetKey<T extends string> = `fleet:${T}`;
export type FleetName<TName extends string> = `plugin:${TName}`;

export interface FleetOptions {
  readonly namespace: string;
  readonly allowOverride: boolean;
  readonly maxConcurrent: number;
}

export type FleetManifest<TSchema extends readonly PluginEnvelope[]> = {
  [K in PluginKind as `by:${K}`]: readonly PluginByKind<TSchema, K>[];
};

export type FleetByKind<TSchema extends readonly PluginEnvelope[]> = {
  readonly route: readonly PluginByKind<TSchema, 'route'>[];
  readonly observe: readonly PluginByKind<TSchema, 'observe'>[];
  readonly transform: readonly PluginByKind<TSchema, 'transform'>[];
  readonly ingest: readonly PluginByKind<TSchema, 'ingest'>[];
  readonly emit: readonly PluginByKind<TSchema, 'emit'>[];
};

export type FleetStatus<TSchema extends readonly PluginEnvelope[]> = {
  readonly namespace: string;
  readonly total: number;
  readonly byKind: FleetByKind<TSchema>;
  readonly channelIndex: readonly FleetChannel[];
};

export type FleetRegistration<TSchema extends readonly PluginEnvelope[]> = {
  readonly namespace: string;
  readonly schema: PluginNameMap<TSchema>;
  readonly channels: readonly PluginChannel<PluginKind>[];
  readonly manifest: FleetManifest<TSchema>;
  readonly snapshot: FleetStatus<TSchema>;
};

export interface FleetRegistrationRecord {
  readonly namespace: string;
  readonly name: string;
  readonly status: FleetMode;
  readonly createdAt: string;
}

type AsyncStack = {
  use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void;
  [Symbol.asyncDispose](): Promise<void>;
};

const createAsyncStack = (): { new (): AsyncStack } => {
  const fallback = class {
    readonly #disposers: Array<() => PromiseLike<void> | void> = [];
    use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void {
      const dispose = resource?.[Symbol.asyncDispose];
      if (typeof dispose === 'function') {
        this.#disposers.push(() => dispose.call(resource));
      }
    }
    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#disposers.length > 0) {
        const dispose = this.#disposers.pop();
        if (dispose) {
          await dispose();
        }
      }
    }
  };

  return (
    (globalThis as {
      AsyncDisposableStack?: { new (): AsyncStack };
    }).AsyncDisposableStack ?? fallback
  );
};

const canonicalName = (name: string): FleetName<string> => `plugin:${name.toLowerCase()}` as FleetName<string>;
const canonicalScope = <TKind extends PluginKind>(scope: TKind, namespace: string): PluginChannel<TKind> =>
  `${scope}::${namespace}`;
const makeChannel = (scope: string): PluginChannel<PluginKind> => `${scope}` as PluginChannel<PluginKind>;

const makeFleetRecord = (namespace: string, name: string): FleetRegistrationRecord => ({
  namespace,
  name,
  status: 'ready',
  createdAt: new Date().toISOString(),
});

export class LatticePluginFleet<const TSchema extends readonly PluginEnvelope[]> {
  readonly #registry = new Map<string, TSchema[number]>();
  readonly #status = new Map<string, FleetRegistrationRecord>();
  readonly #channels = new Map<FleetChannel, string>();
  #state: FleetMode = 'idle';

  public constructor(
    private readonly namespace: string,
    private readonly options: FleetOptions,
    private readonly schema: readonly TSchema[number][],
  ) {
    const entries = options.allowOverride ? [...schema] : [...schema];
    for (const entry of entries) {
      this.#register(entry);
    }
    this.#state = 'ready';
  }

  public get state(): FleetMode {
    return this.#state;
  }

  public get namespaceName(): string {
    return this.namespace;
  }

  public get count(): number {
    return this.#registry.size;
  }

  public list(): readonly TSchema[number][] {
    return [...this.#registry.values()];
  }

  public listByKind<TKind extends PluginKind>(kind: TKind): readonly PluginByKind<TSchema, TKind>[] {
    return this.list().filter(
      (entry): entry is PluginByKind<TSchema, TKind> => entry.kind === kind,
    );
  }

  public listByScope<TValue extends string>(scope: TValue): readonly TSchema[number][] {
    const prefix = makeChannel(`scope:${scope}`);
    return this.list().filter((entry) => this.#channels.get(entry.scope as PluginChannel) === prefix);
  }

  public byName(name: string): TSchema[number] | undefined {
    return this.#registry.get(canonicalName(name)) ?? this.#registry.get(name);
  }

  public register<TPlugin extends TSchema[number]>(
    plugin: NoInfer<TPlugin>,
  ): void {
    const existing = this.byName(plugin.name);
    const key = canonicalName(plugin.name);
    if (!this.options.allowOverride && existing) {
      return;
    }

    this.#register({
      ...plugin,
      status: 'active',
      metadata: { ...(plugin.metadata as Record<string, string>), namespace: this.namespace },
    } as TPlugin);
    this.#status.set(key, makeFleetRecord(this.namespace, String(plugin.name)));
  }

  public resolve<TKind extends PluginKind, TName extends string>(
    kind: TKind,
    name: TName,
  ): readonly PluginByKind<TSchema, TKind>[] {
    return this.listByKind(kind).filter((plugin) => plugin.name === name);
  }

  public supports<TKind extends PluginKind>(kind: TKind): boolean {
    return this.listByKind(kind).length > 0;
  }

  public async execute<TKind extends PluginKind, TInput = unknown, TOutput = unknown>(
    kind: TKind,
    name: string,
    input: NoInfer<TInput>,
    context: PluginContext,
    fallback: TOutput,
  ): Promise<PluginResult<TOutput>> {
    const plugin = this.listByKind(kind).find((entry) => entry.name === name);
    if (!plugin) {
      return {
        status: 'degraded',
        payload: fallback,
        warnings: ['plugin-not-found'],
      };
    }
    const output = await plugin.execute(input as never, context);
    return {
      status: output.status,
      payload: (output.payload ?? fallback) as TOutput,
      warnings: output.warnings ?? ['adapter-bridge'],
    };
  }

  public snapshot(): FleetStatus<TSchema> {
    const byKind = {
      route: this.listByKind('route'),
      observe: this.listByKind('observe'),
      transform: this.listByKind('transform'),
      ingest: this.listByKind('ingest'),
      emit: this.listByKind('emit'),
    } as FleetByKind<TSchema>;

    const channelIndex = [...this.#channels.keys()].toSorted();
    return {
      namespace: this.namespace,
      total: this.#registry.size,
      byKind,
      channelIndex,
    };
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    const Stack = createAsyncStack();
    await using stack = new Stack();
    const closer = {
      [Symbol.asyncDispose]: async () => {
        this.#state = 'closed';
        this.#registry.clear();
        this.#status.clear();
        this.#channels.clear();
      },
    };
    stack.use(closer);
  }

  #register(plugin: TSchema[number]): void {
    const nameKey = canonicalName(plugin.name);
    const scope = canonicalScope(plugin.kind, plugin.metadata.namespace ?? this.namespace);
    this.#registry.set(nameKey, plugin);
    this.#channels.set(plugin.scope, scope);
    this.#status.set(nameKey, {
      namespace: this.namespace,
      name: plugin.name,
      status: 'ready',
      createdAt: new Date().toISOString(),
    });
  }
}

export const createDefaultFleet = <TSchema extends readonly PluginEnvelope[]>(
  namespace: string,
  entries: TSchema,
  options: Partial<FleetOptions> = {},
): LatticePluginFleet<TSchema> =>
  new LatticePluginFleet(
    namespace,
    {
      namespace,
      allowOverride: false,
      maxConcurrent: 16,
      ...options,
    },
    [...entries],
  );

export const normalizeFleetStatus = <TSchema extends readonly PluginEnvelope[]>(
  fleet: LatticePluginFleet<TSchema>,
): FleetRegistration<TSchema> => {
  const snapshot = fleet.snapshot();
  const schema = Object.fromEntries(
    fleet.list().map((entry) => [canonicalName(entry.name), entry]),
  ) as FleetRegistration<TSchema>['schema'];

  return {
    namespace: snapshot.namespace,
    schema,
    channels: [...fleet.snapshot().channelIndex],
    manifest: snapshot.byKind as unknown as FleetManifest<TSchema>,
    snapshot,
  };
};
