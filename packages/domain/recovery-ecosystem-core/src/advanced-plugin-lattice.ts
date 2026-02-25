import { asHealthScore } from './models';
import {
  asRunId,
  asTraceId,
  asTenantId,
  type NamespaceTag,
  type RunId,
  type TenantId,
} from './identifiers';
import type { PluginInput, EcosystemPlugin, PluginOutput } from './plugin-contract';
import type { JsonValue, NoInfer } from '@shared/type-level';

export type RegisteredName<TPlugins extends readonly EcosystemPlugin[]> = TPlugins[number] extends infer TPlugin
  ? TPlugin extends EcosystemPlugin
    ? TPlugin['name']
    : never
  : never;

export type PluginDependencyMatrix<TPlugins extends readonly EcosystemPlugin[]> = {
  [TPlugin in RegisteredName<TPlugins>]: {
    readonly before: readonly RegisteredName<TPlugins>[];
    readonly after: readonly RegisteredName<TPlugins>[];
  };
};

export type PluginManifestEnvelope<TPlugins extends readonly EcosystemPlugin[]> = {
  [TPlugin in RegisteredName<TPlugins> as `manifest:${TPlugin & string}`]: {
    readonly plugin: TPlugin;
    readonly namespace: NamespaceTag;
    readonly dependencies: PluginDependencyMatrix<TPlugins>[TPlugin]['before'];
    readonly enabled: boolean;
  };
};

export type LatticeExecutionMode = 'strict' | 'best-effort';

export interface PluginLatticeRuntime<TPlugins extends readonly EcosystemPlugin[]> {
  readonly namespace: NamespaceTag;
  readonly tenant: TenantId;
  readonly plugins: TPlugins;
  readonly mode: LatticeExecutionMode;
  readonly order: PluginOrder<TPlugins>;
}

export interface PluginLatticeTrace<TPlugins extends readonly EcosystemPlugin[] = readonly EcosystemPlugin[]> {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly plugin: RegisteredName<TPlugins>;
  readonly durationMs: number;
  readonly phase: 'queued' | 'running' | 'completed' | 'skipped' | 'failed';
}

export type PluginOrder<TPlugins extends readonly EcosystemPlugin[]> = readonly RegisteredName<TPlugins>[];

export type LatticePolicy = readonly [string, string, string, string];

export type PluginEventPayload<TPlugins extends readonly EcosystemPlugin[]> = {
  [TName in RegisteredName<TPlugins>]: {
    readonly kind: `event:${string}`;
    readonly plugin: TName;
    readonly index: number;
  };
};

type SeedToken<TValue extends string> = TValue extends `${infer Prefix}` ? Prefix : never;

const asPluginName = <TValue extends string>(value: TValue): `plugin:${Lowercase<TValue>}` =>
  `plugin:${String(value).replace(/^plugin:/, '').toLowerCase()}` as `plugin:${Lowercase<TValue>}`;

const normalizeDependency = (value: string): string => (value.startsWith('dep:') ? value.slice(4) : value);

const dedupeByName = <TPlugins extends readonly EcosystemPlugin[]>(plugins: TPlugins): TPlugins => {
  const seen = new Set<string>();
  const output = plugins.filter((plugin) => {
    if (seen.has(plugin.name)) {
      return false;
    }
    seen.add(plugin.name);
    return true;
  });
  return output as unknown as TPlugins;
};

const sortPlugins = <TPlugins extends readonly EcosystemPlugin[]>(plugins: TPlugins): TPlugins => {
  const normalized = [...plugins].toSorted((left, right) => String(left.name).localeCompare(String(right.name)));
  return dedupeByName(normalized as unknown as TPlugins);
};

const toDependencyMap = <TPlugins extends readonly EcosystemPlugin[]>(plugins: TPlugins): ReadonlyMap<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const plugin of plugins) {
    map.set(
      plugin.name,
      [...plugin.dependsOn].map((dependency) => {
        const normalized = normalizeDependency(dependency as string);
        return asPluginName(`plugin:${normalized}` as string);
      }),
    );
  }
  return map;
};

const topologicalOrder = <TPlugins extends readonly EcosystemPlugin[]>(plugins: TPlugins): PluginOrder<TPlugins> => {
  const ordered: string[] = [];
  const edges = toDependencyMap(plugins);
  const visiting = new Set<string>();
  const processed = new Set<string>();

  const walk = (name: string): void => {
    if (processed.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new Error(`plugin-lattice-cycle:${name}`);
    }

    visiting.add(name);
    for (const dependency of edges.get(name) ?? []) {
      if (edges.has(dependency)) {
        walk(dependency);
      }
    }
    visiting.delete(name);
    processed.add(name);
    ordered.push(name);
  };

  for (const name of edges.keys()) {
    walk(name);
  }

  return ordered as unknown as PluginOrder<TPlugins>;
};

export const isSeedPlugin = (value: string): value is `plugin:${string}` =>
  value.startsWith('plugin:') && value.endsWith('seed');

const normalizeDependencyKind = <TValue extends `plugin:${string}`>(value: TValue): TValue =>
  value.startsWith('plugin:') ? value : asPluginName(value) as TValue;

export const buildManifestIndex = <TPlugins extends readonly EcosystemPlugin[]>(
  namespace: NamespaceTag,
  plugins: TPlugins,
): PluginManifestEnvelope<TPlugins> => {
  const entries = plugins.toSorted((left, right) => String(left.name).localeCompare(String(right.name))).map((plugin) => {
    const pluginName = plugin.name as RegisteredName<TPlugins>;
    const mapped = plugin.dependsOn.map((dependency) => {
      const normalized = dependency.includes('plugin:') ? dependency : `plugin:${String(dependency)}`;
      return normalizeDependencyKind(normalized as `plugin:${string}`) as PluginDependencyMatrix<TPlugins>[typeof pluginName]['before'][number];
    }) as unknown as PluginDependencyMatrix<TPlugins>[RegisteredName<TPlugins>]['before'];

    const value = {
      plugin: pluginName,
      namespace,
      dependencies: mapped,
      enabled: plugin.tags.some((tag) => tag.includes('tag:enable') || tag.includes('tag:default')),
    } satisfies PluginManifestEnvelope<TPlugins>[typeof pluginName];

    return [`manifest:${pluginName}` as const, value] as const;
  });

  return Object.fromEntries(entries) as PluginManifestEnvelope<TPlugins>;
};

const normalizePluginOutput = <TOutput extends JsonValue>(output: PluginOutput<TOutput>): PluginOutput<TOutput> => ({
  output: output.output,
  summary: output.summary,
  consumed: output.consumed,
  produced: output.produced,
  artifacts: output.artifacts,
});

export class PluginLattice<TPlugins extends readonly EcosystemPlugin[]> implements AsyncDisposable {
  readonly #plugins: TPlugins;
  readonly #namespace: NamespaceTag;
  readonly #tenant: TenantId;
  readonly #order: PluginOrder<TPlugins>;
  readonly #state = new Map<string, PluginLatticeTrace['phase']>();
  #closed = false;

  public constructor(
    public readonly runtime: PluginLatticeRuntime<TPlugins>,
    initial?: { readonly enabled?: readonly RegisteredName<TPlugins>[] },
  ) {
    const normalized = sortPlugins(runtime.plugins);
    this.#plugins = normalized;
    this.#namespace = runtime.namespace;
    this.#tenant = runtime.tenant;
    this.#order = runtime.order;

    for (const name of this.#order) {
      this.#state.set(name, initial?.enabled ? 'queued' : 'queued');
    }
    for (const name of initial?.enabled ?? []) {
      this.#state.set(String(name), 'running');
    }
  }

  public get order(): PluginOrder<TPlugins> {
    return this.#order;
  }

  public get namespace(): NamespaceTag {
    return this.#namespace;
  }

  public get tenant(): TenantId {
    return this.#tenant;
  }

  public get isClosed(): boolean {
    return this.#closed;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#state.clear();
    this.#closed = true;
  }

  public manifest(namespace: NamespaceTag = this.#namespace): PluginManifestEnvelope<TPlugins> {
    return buildManifestIndex(namespace, this.#plugins);
  }

  public map<TPayload extends JsonValue>(payload: TPayload): PluginEventPayload<TPlugins> {
    const output = Object.create(null) as PluginEventPayload<TPlugins>;
    for (const [index, plugin] of this.#order.entries()) {
      output[plugin as keyof PluginEventPayload<TPlugins>] = {
        kind: 'event:plugin-prepare',
        plugin,
        index,
      } as PluginEventPayload<TPlugins>[keyof PluginEventPayload<TPlugins>];
    }
    void payload;
    return output;
  }

  public async execute<TPayload extends JsonValue>(
    tenant: NoInfer<TenantId>,
    runId: NoInfer<RunId>,
    payload: NoInfer<TPayload>,
  ): Promise<readonly PluginLatticeTrace<TPlugins>[]> {
    const traces: PluginLatticeTrace<TPlugins>[] = [];
    const run = asRunId(`run:${tenant}:${runId}:${Date.now()}`);
    const started = new Date().toISOString();

    await using _scope = new AsyncDisposableStack();

    for (const [index, name] of this.#order.entries()) {
      if (this.#closed) {
        break;
      }

      const plugin = this.#plugins.find((entry) => entry.name === name);
      if (!plugin) {
        throw new Error(`plugin-missing:${name}`);
      }

      this.#state.set(name, 'running');
      const phaseStart = performance.now();

      const pluginInput: PluginInput<NoInfer<TPayload>> = {
        runId,
        tenant,
        namespace: this.#namespace,
        trace: [...this.#order.slice(0, index + 1)],
        input: payload,
      };

      const pluginContext = {
        id: asTraceId(`trace:${name}:${Date.now()}`),
        namespace: this.#namespace,
        startedAt: started,
        input: payload,
        correlation: {
          runId,
          tenant,
        },
      };

      const result = await plugin.run(pluginInput as never, pluginContext as never);

      const phase: PluginLatticeTrace['phase'] =
        result.status === 'success'
          ? 'completed'
          : result.status === 'skipped' || result.status === 'cancelled'
            ? 'skipped'
            : result.status === 'error'
              ? 'failed'
              : 'failed';

      this.#state.set(name, phase);
      traces.push({
        runId: run,
        tenant,
        plugin: name,
        durationMs: performance.now() - phaseStart,
        phase,
      });

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      if (result.status === 'success' && result.output) {
        const normalized = normalizePluginOutput(result.output);
        void normalized;
      }
    }

    return traces.toSorted((left, right) => right.durationMs - left.durationMs);
  }

  public static createPlan<TPlugins extends readonly EcosystemPlugin[]>(
    plugins: TPlugins,
    namespace: NamespaceTag,
    tenant: TenantId = 'tenant:default' as TenantId,
  ): PluginLatticeRuntime<TPlugins> {
    const ordered = sortPlugins(plugins);
    return {
      namespace,
      tenant: asTenantId(String(tenant)),
      plugins: ordered,
      mode: 'strict',
      order: topologicalOrder(ordered),
    };
  }

  public static seed(count = 4): readonly `plugin:${string}`[] {
    const values = ['seed', 'policy', 'artifact', 'signal', 'metric'];
    return values
      .toSorted()
      .slice(0, count)
      .map((value) => asPluginName(value));
  }

  public trace(policy: LatticePolicy): readonly PluginLatticeTrace[] {
    return policy
      .map((entry, index) => ({
        runId: asRunId(`policy:${entry}:${index}`),
        tenant: this.#tenant,
        plugin: `plugin:${entry}` as RegisteredName<TPlugins>,
        durationMs: index + 4,
        phase: (index === 0 ? 'queued' : 'running') as PluginLatticeTrace<TPlugins>['phase'],
      }))
      .toSorted((left, right) => left.durationMs - right.durationMs);
  }
}

export const normalizeLatticePolicy = <TValues extends readonly string[]>(values: TValues): LatticePolicy => {
  const normalized = [...values, ...Array.from({ length: Math.max(0, 4 - values.length) }, () => 'none')];
  return [
    normalized.at(0) ?? 'seed',
    normalized.at(1) ?? 'none',
    normalized.at(2) ?? 'none',
    normalized.at(3) ?? 'none',
  ];
};

export const pluginNameFromSeed = <TValue extends `plugin:${string}`>(
  input: TValue,
): `plugin:${SeedToken<TValue>}` => {
  const normalized = input.replace(/^plugin:/, '');
  return asPluginName(normalized) as `plugin:${SeedToken<TValue>}`;
};

export const pluginEventKinds = [
  'event:bootstrapped',
  'event:plugin-invoked',
  'event:plugin-complete',
] as const satisfies readonly `event:${string}`[];
