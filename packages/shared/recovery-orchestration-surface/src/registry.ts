import { NoInfer } from '@shared/type-level';
import type {
  PluginInputForKind,
  PluginOutputForKind,
  SurfaceContextSchema,
  SurfaceLaneKind,
  SurfacePluginContract,
  SurfaceSignalEnvelope,
} from './contracts';
import type { SurfacePluginId, SurfaceRuntimeContext, SurfaceWorkspaceId } from './identity';
import { SurfacePlugin } from './plugins';

export interface PluginExecutionRecord {
  readonly pluginId: SurfacePluginId;
  readonly kind: SurfaceLaneKind;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly ok: boolean;
}

type PluginTuple = readonly SurfacePluginContract[];
type PluginMap<TCatalog extends PluginTuple> = Record<SurfacePluginId, SurfacePlugin>;

export type RegistrySnapshot = Record<string, SurfaceLaneKind>;

type PluginKindCatalog<TCatalog extends PluginTuple> = {
  [Plugin in TCatalog[number] as Plugin['id']]: Plugin;
};

type AsyncDisposer = { [Symbol.asyncDispose](): Promise<void> };

type AsyncStackCtor = new () => {
  use<T extends AsyncDisposer>(resource: T): T;
  adopt<T>(resource: T, onDispose: (resource: T) => Promise<void> | void): T;
  defer(disposer: () => Promise<void> | void): void;
  [Symbol.asyncDispose](): Promise<void>;
};

const createStackCtor = (): AsyncStackCtor => {
  const candidate = (globalThis as { AsyncDisposableStack?: AsyncStackCtor }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }

  return class FallbackAsyncDisposableStack {
    readonly #disposers: Array<() => Promise<void> | void> = [];

    use<T extends AsyncDisposer>(resource: T): T {
      this.adopt(resource, (value) => value[Symbol.asyncDispose]());
      return resource;
    }

    adopt<T>(resource: T, onDispose: (resource: T) => Promise<void> | void): T {
      this.#disposers.push(() => onDispose(resource));
      return resource;
    }

    defer(disposer: () => Promise<void> | void): void {
      this.#disposers.push(disposer);
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        const dispose = this.#disposers[index];
        if (dispose) {
          await dispose();
        }
      }
    }
  };
};

const AsyncStack = createStackCtor();

class ExecutionScope implements AsyncDisposer {
  constructor(private readonly id: string) {}

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }

  toString(): string {
    return `scope:${this.id}`;
  }
}

export interface PluginSummary<TCatalog extends PluginTuple> {
  readonly total: number;
  readonly kinds: Record<SurfaceLaneKind, number>;
  readonly laneMap: PluginKindCatalog<TCatalog>;
}

export class SurfacePluginRegistry<
  TCatalog extends readonly SurfacePluginContract[],
  TDefaultScope extends SurfaceLaneKind = SurfaceLaneKind,
> {
  readonly #plugins = {} as PluginMap<TCatalog>;
  readonly #ordered: SurfacePlugin[] = [];
  readonly #records: PluginExecutionRecord[] = [];
  readonly #scopeKind: TDefaultScope;

  constructor(
    private readonly workspaceId: SurfaceWorkspaceId,
    private readonly plugins: TCatalog,
    options: { defaultScope?: TDefaultScope } = {},
  ) {
    this.#scopeKind = options.defaultScope ?? ('ingest' as TDefaultScope);
    for (const plugin of plugins) {
      const wrapper = new SurfacePlugin(plugin, `${this.workspaceId}:${plugin.id}:telemetry` as never);
      this.#plugins[plugin.id] = wrapper as never;
      this.#ordered.push(wrapper);
    }
  }

  get summary(): PluginSummary<TCatalog> {
    const counts = this.#ordered.reduce(
      (map, plugin) => {
        const current = map[plugin.kind] ?? 0;
        return {
          ...map,
          [plugin.kind]: current + 1,
        };
      },
      {
        ingest: 0,
        synthesize: 0,
        simulate: 0,
        score: 0,
        actuate: 0,
      } as Record<SurfaceLaneKind, number>,
    );

    const laneMap = Object.fromEntries(
      this.#ordered.map((plugin) => [plugin.id, plugin]),
    ) as unknown as PluginKindCatalog<TCatalog>;

    return {
      total: this.#ordered.length,
      kinds: counts,
      laneMap,
    };
  }

  get scopeKind(): TDefaultScope {
    return this.#scopeKind;
  }

  register<TPlugin extends TCatalog[number]>(plugin: TPlugin): TPlugin {
    const wrapped = new SurfacePlugin(plugin, `${plugin.id}:registered` as never);
    this.#plugins[plugin.id] = wrapped as never;
    this.#ordered.push(wrapped);
    return plugin;
  }

  byKind<TKind extends SurfaceLaneKind>(kind: TKind): readonly SurfacePlugin[] {
    return this.#ordered.filter((plugin) => plugin.kind === kind);
  }

  get ids(): readonly SurfacePluginId[] {
    return this.#ordered.map((plugin) => plugin.id);
  }

  async run<TKind extends SurfaceLaneKind, TInput extends PluginInputForKind<TCatalog, TKind>>(
    pluginId: SurfacePluginId,
    kind: TKind,
    input: NoInfer<TInput>,
    context: NoInfer<SurfaceRuntimeContext>,
    signal: SurfaceSignalEnvelope,
  ): Promise<PluginOutputForKind<TCatalog, TKind>> {
    const plugin = this.#plugins[pluginId];
    if (!plugin || plugin.kind !== kind) {
      throw new Error(`No plugin matched id=${pluginId} kind=${kind}`);
    }

    await using _scope = new AsyncStack();
    await using scope = new ExecutionScope(pluginId);
    _scope.adopt(scope, (value) => value[Symbol.asyncDispose]());

    const startedAt = Date.now();
    this.#records.push({
      pluginId,
      kind,
      startedAt,
      endedAt: startedAt,
      ok: false,
    });

    try {
      const result = await plugin.execute(input as Record<string, unknown>, context, signal);
      const endedAt = Date.now();
      this.#records.push({
        pluginId,
        kind,
        startedAt,
        endedAt,
        ok: true,
      });
      return result.data as PluginOutputForKind<TCatalog, TKind>;
    } catch (error) {
      const endedAt = Date.now();
      this.#records.push({
        pluginId,
        kind,
        startedAt,
        endedAt,
        ok: false,
      });
      throw error;
    }
  }

  async runChain<TKind extends SurfaceLaneKind>(
    kind: TKind,
    input: PluginInputForKind<TCatalog, TKind>,
    context: NoInfer<SurfaceRuntimeContext>,
    signal: SurfaceSignalEnvelope,
  ): Promise<readonly PluginOutputForKind<TCatalog, TKind>[]> {
    const plugins = this.byKind(kind);
    let current: unknown = input;
    const values: PluginOutputForKind<TCatalog, TKind>[] = [];

    for (let index = 0; index < plugins.length; index += 1) {
      const plugin = plugins[index];
      if (!plugin) {
        continue;
      }

      const currentSignal = {
        ...signal,
        generatedAt: Date.now(),
        signalId: `${signal.signalId}:${index}` as any,
      } as SurfaceSignalEnvelope;

      const value = await this.run(
        plugin.id,
        kind,
        current as PluginInputForKind<TCatalog, TKind>,
        context,
        currentSignal,
      );
      current = value;
      values.push(value);
    }

    return values;
  }

  snapshots(): PluginExecutionRecord[] {
    return [...this.#records];
  }

  async evaluateWorkload(): Promise<{
    readonly ready: boolean;
    readonly score: number;
    readonly records: PluginExecutionRecord[];
    readonly context: SurfaceContextSchema;
  }> {
    const ready = this.#ordered.length > 0 && this.#records.every((record) => record.ok);
    const score = this.#ordered.length === 0 ? 0 : Math.max(1, this.#records.length) % 100;
    const context: SurfaceContextSchema = {
      workspaceId: this.#ordered[0]?.workspaceId ?? 'workspace:undefined',
      lane: this.#ordered[0]?.lane ?? 'lane:undefined',
      stage: 'bootstrap',
      metadata: {
        tenant: 'acme',
        domain: 'recovery',
        namespace: 'runtime',
        createdAt: Date.now(),
        createdBy: 'recovery-orchestration-surface',
      },
      createdAt: Date.now(),
    } satisfies SurfaceContextSchema;

    return { ready, score, records: this.snapshots(), context };
  }
}

export const buildRegistrySummary = <TCatalog extends readonly SurfacePluginContract[]>(
  registry: SurfacePluginRegistry<TCatalog>,
): RegistrySnapshot =>
  Object.fromEntries(registry.ids.map((pluginId) => [pluginId, registry.scopeKind])) as RegistrySnapshot;

export const evaluateRecords = (
  records: readonly PluginExecutionRecord[],
): Readonly<Record<'ok' | 'error', number>> =>
  records.reduce(
    (acc, record) => {
      if (record.ok) {
        return { ...acc, ok: acc.ok + 1 };
      }
      return { ...acc, error: acc.error + 1 };
    },
    { ok: 0, error: 0 },
  );

export const summarizeByKind = (
  records: readonly PluginExecutionRecord[],
): Readonly<Record<SurfaceLaneKind, readonly PluginExecutionRecord[]>> => {
  const output = {
    ingest: [] as PluginExecutionRecord[],
    synthesize: [] as PluginExecutionRecord[],
    simulate: [] as PluginExecutionRecord[],
    score: [] as PluginExecutionRecord[],
    actuate: [] as PluginExecutionRecord[],
  };

  for (const record of records) {
    output[record.kind] = [...output[record.kind], record];
  }

  return output;
};

export const normalizeRecordLatency = (record: PluginExecutionRecord): number => Math.max(0, record.endedAt - record.startedAt);

const kindTuple = ['ingest', 'synthesize', 'simulate', 'score', 'actuate'] as const;
export const stageFromLatency = (latencyMs: number): (typeof kindTuple)[number] => {
  if (latencyMs <= 0) return 'ingest';
  if (latencyMs <= 200) return 'simulate';
  if (latencyMs <= 400) return 'score';
  if (latencyMs <= 600) return 'synthesize';
  return 'actuate';
};
