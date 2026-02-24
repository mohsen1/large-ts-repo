import { Brand } from '@shared/core';
import { AdaptivePolicy, AdaptiveDecision, AdaptiveAction, SignalKind, SignalSample } from './types';

export const pluginKinds = ['ingest', 'transform', 'evaluate', 'simulate', 'commit'] as const;
export type PluginKind = (typeof pluginKinds)[number];

export const pluginVersionRegex = /^\d+\.\d+\.\d+$/;

export type PluginVersion = `${number}.${number}.${number}`;
export type PluginId<TKind extends PluginKind = PluginKind> = Brand<string, `plugin:${TKind}`>;
export type PluginEventId<TKind extends PluginKind = PluginKind> = `${TKind}-event:${string}`;

export type RuntimeInput = {
  tenantId: string;
  policies: readonly AdaptivePolicy[];
  decisions: readonly AdaptiveDecision[];
  actions: readonly AdaptiveAction[];
  signals: readonly SignalSample[];
};

export type PluginResult = {
  pluginId: string;
  kind: PluginKind;
  accepted: boolean;
  score: number;
  warnings: readonly string[];
  tags: readonly string[];
};

export type PluginContext<TInput = unknown> = RuntimeInput & {
  readonly input: TInput;
  readonly timestamp: string;
  readonly traceId: string;
  readonly stage: PluginKind;
};

export interface PluginMetadata<K extends PluginKind, TInput> {
  readonly kind: K;
  readonly id: PluginId<K>;
  readonly name: string;
  readonly version: PluginVersion;
  readonly accepts: readonly SignalKind[];
  readonly stages: readonly PluginKind[];
  readonly config: TInput;
}

export interface PluginDefinition<K extends PluginKind = PluginKind, TInput = unknown> extends PluginMetadata<K, TInput> {
  readonly run: (context: PluginContext<TInput>) => Promise<PluginResult>;
}

export type PluginResultByKind<
  TDefs extends readonly PluginDefinition[],
  K extends PluginKind,
> = Extract<TDefs[number], { kind: K }> extends PluginDefinition<PluginKind, infer Input>
  ? (context: PluginContext<Input>) => Promise<PluginResult>
  : (context: PluginContext<unknown>) => Promise<PluginResult>;

export type PluginBucket<TDefs extends readonly PluginDefinition[]> = {
  [Kind in TDefs[number] as Kind['kind']]: Extract<TDefs[number], { kind: Kind['kind'] }>;
};

export interface RegistryEvent {
  at: string;
  kind: PluginKind;
  pluginId: string;
  status: 'registered' | 'executed' | 'failed';
  message: string;
}

const eventBuffer: RegistryEvent[] = [];

const createEvent = (kind: PluginKind, pluginId: string, status: RegistryEvent['status'], message: string): RegistryEvent => ({
  at: new Date().toISOString(),
  kind,
  pluginId,
  status,
  message,
});

type InferConfig<T> = T extends PluginDefinition<PluginKind, infer C> ? C : unknown;
type PluginByKind<TDefs extends readonly PluginDefinition[], K extends PluginKind> = Extract<TDefs[number], { kind: K }>;
type ContextByKind<TDefs extends readonly PluginDefinition[], K extends PluginKind> = PluginContext<
  InferConfig<PluginByKind<TDefs, K>>
>;

export class PluginRegistry<TDefs extends readonly PluginDefinition[]> {
  private readonly plugins = new Map<PluginId | string, TDefs[number]>();
  private readonly byKind = new Map<PluginKind, Set<PluginId | string>>();

  constructor(private readonly defs: TDefs) {}

  static create<TDefs extends readonly PluginDefinition[]>(defs: TDefs): PluginRegistry<TDefs> {
    return new PluginRegistry(defs);
  }

  register(plugin: NoInfer<TDefs[number]>) {
    if (typeof plugin.id !== 'string' || plugin.id.trim().length === 0) {
      throw new Error('plugin id cannot be empty');
    }
    if (!pluginVersionRegex.test(plugin.version)) {
      throw new Error(`invalid version ${plugin.version}`);
    }
    this.plugins.set(plugin.id, plugin);
    const entries = this.byKind.get(plugin.kind) ?? new Set<string>();
    entries.add(plugin.id);
    this.byKind.set(plugin.kind, entries);
    eventBuffer.push(createEvent(plugin.kind, plugin.id as string, 'registered', `registered ${plugin.name}`));
    return this;
  }

  registerAll(definitions: readonly NoInfer<TDefs[number]>[]) {
    for (const definition of definitions) {
      this.register(definition);
    }
    return this;
  }

  list(): readonly TDefs[number][] {
    return [...this.plugins.values()];
  }

  listByKind<K extends PluginKind>(kind: K): readonly Extract<TDefs[number], { kind: K }>[] {
    const set = this.byKind.get(kind);
    if (!set) {
      return [];
    }
    return [...set].flatMap((pluginId) => {
      const plugin = this.plugins.get(pluginId);
      return plugin ? [plugin as Extract<TDefs[number], { kind: K }>] : [];
    });
  }

  has(kind: PluginKind, pluginId: PluginId | string): boolean {
    const entries = this.byKind.get(kind);
    return entries?.has(pluginId) ?? false;
  }

  async runByKind<K extends PluginKind>(
    kind: K,
    context: Omit<ContextByKind<TDefs, K>, 'stage'>,
  ): Promise<PluginResult[]> {
    const entries = this.listByKind(kind);
    const timestamped = {
      ...context,
      stage: kind,
      timestamp: new Date().toISOString(),
      traceId: `trace-${kind}-${Date.now()}`,
    };
    const responses = await Promise.allSettled(entries.map((entry) => entry.run(timestamped as PluginContext<unknown>)));
    return responses.map((response) => {
      if (response.status === 'rejected') {
        eventBuffer.push(createEvent(kind, `${context.tenantId}:${kind}`, 'failed', response.reason));
        return {
          pluginId: `${context.tenantId}:${kind}`,
          kind: kind,
          accepted: false,
          score: 0,
          warnings: [String(response.reason)],
          tags: ['rejected'],
        };
      }
      eventBuffer.push(createEvent(kind, (response.value as PluginResult).pluginId, 'executed', `executed ${kind}`));
      return response.value as PluginResult;
    });
  }

  async runAll(context: Omit<PluginContext<unknown>, 'stage'>, policyLimit: number): Promise<PluginResult[]> {
    const selected = this.filterPlugins(context.policies, policyLimit);
    const results = await Promise.all(selected.map((plugin) => plugin.run({ ...context, stage: plugin.kind } as PluginContext<unknown>)));
    return results;
  }

  filterPlugins(policies: readonly AdaptivePolicy[], limit: number) {
    const ids = new Set(policies.flatMap((policy) => policy.dependencies.map((dependency) => `${dependency.serviceId}`)));
    const selected = [...this.plugins.values()]
      .filter((plugin) =>
        plugin.stages.some((stage) =>
          stage === 'simulate' || stage === 'commit' || stage === 'ingest'
            ? true
            : plugin.accepts.some((kind) => ids.has(kind)),
        ),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, limit);

    return selected;
  }

  events(sinceMs = 0): readonly RegistryEvent[] {
    if (sinceMs <= 0) return [...eventBuffer];
    const since = Date.now() - sinceMs;
    return eventBuffer.filter((event) => Date.parse(event.at) >= since);
  }

  toManifest() {
    return this.list().map((plugin) => ({
      id: plugin.id,
      kind: plugin.kind,
      name: plugin.name,
      version: plugin.version,
      accepts: plugin.accepts,
      stages: plugin.stages,
    }));
  }
}

export type PluginRunBundle<TDefs extends readonly PluginDefinition[]> = {
  registry: PluginRegistry<TDefs>;
  kind: PluginKind;
};

export interface PluginRunSummary {
  tenantId: string;
  runId: string;
  totalPlugins: number;
  totalWarnings: number;
  accepted: number;
}

export const toRunSummary = (tenantId: string, runId: string, results: readonly PluginResult[]): PluginRunSummary => {
  return {
    tenantId,
    runId,
    totalPlugins: results.length,
    totalWarnings: results.reduce((acc, result) => acc + result.warnings.length, 0),
    accepted: results.filter((result) => result.accepted).length,
  };
};

export const describeKind = (kind: PluginKind): string => {
  const mapping: Record<PluginKind, string> = {
    ingest: 'ingest raw telemetry',
    transform: 'transform and normalize',
    evaluate: 'evaluate policy outcomes',
    simulate: 'simulate candidate actions',
    commit: 'commit selected commands',
  };
  return mapping[kind];
};
