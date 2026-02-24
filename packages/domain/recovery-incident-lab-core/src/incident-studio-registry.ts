import { Brand, withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type { IncidentLabStudioRunState, StudioSessionId } from './incident-studio-types';

export const studioPluginKinds = ['topology', 'planner', 'scheduler', 'telemetry', 'policy', 'report'] as const;
export type StudioPluginKind = (typeof studioPluginKinds)[number];
export type StudioPluginKindTag = `${StudioPluginKind}-plugin`;
export type StudioPluginScope = `${StudioPluginKindTag}:${string}`;
export type StudioPluginId = Brand<string, 'IncidentLabStudioPluginId'>;
export type StudioRunToken = Brand<string, 'IncidentLabStudioRunToken'>;

export interface StudioPluginContext {
  readonly sessionId: StudioSessionId;
  readonly scope: string;
  readonly traceId: string;
  readonly startedAt: string;
  readonly includeTelemetry: boolean;
}

export type IncidentLabStudioPluginContext = StudioPluginContext;

export interface StudioPluginMetadata {
  readonly pluginId: StudioPluginId;
  readonly name: string;
  readonly kind: StudioPluginKindTag;
  readonly scope: StudioPluginScope;
  readonly version: string;
  readonly priority: number;
}

export interface IncidentLabStudioPlugin<
  TName extends string = string,
  TKind extends StudioPluginKindTag = StudioPluginKindTag,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends readonly string[] = readonly [],
  TProduces extends readonly string[] = readonly [],
> extends StudioPluginMetadata {
  readonly consumes: TConsumes;
  readonly produces: TProduces;
  readonly context: TKind;
  readonly run: (input: TInput, pluginContext: StudioPluginContext) => Promise<TOutput> | TOutput;
  readonly name: TName;
}

export type AnyIncidentLabStudioPlugin = IncidentLabStudioPlugin<any, any, any, any, readonly string[], readonly string[]>;
export type StudioPluginInput<TPlugin extends AnyIncidentLabStudioPlugin> = TPlugin extends IncidentLabStudioPlugin<
  any,
  any,
  infer TInput,
  any,
  any,
  any
>
  ? TInput
  : never;
export type StudioPluginOutput<TPlugin extends AnyIncidentLabStudioPlugin> = TPlugin extends IncidentLabStudioPlugin<
  any,
  any,
  any,
  infer TOutput,
  any,
  any
>
  ? TOutput
  : never;

export type StudioPluginRunChain<
  TPlugins extends readonly AnyIncidentLabStudioPlugin[],
  TSeed,
> = TPlugins extends readonly [infer THead extends AnyIncidentLabStudioPlugin, ...infer TRest extends readonly AnyIncidentLabStudioPlugin[]]
  ? TRest extends readonly AnyIncidentLabStudioPlugin[]
    ? StudioPluginRunChain<TRest, StudioPluginOutput<THead>>
    : StudioPluginOutput<THead>
  : TSeed;

export interface PluginAuditRecord {
  readonly pluginId: StudioPluginId;
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly at: string;
}

export interface StudioPluginCatalogState {
  readonly total: number;
  readonly plugins: readonly StudioPluginId[];
}

export interface IncidentLabStudioPluginHandle<TPlugin extends AnyIncidentLabStudioPlugin> extends Disposable {
  readonly pluginId: StudioPluginId;
  readonly plugin: TPlugin;
  readonly trace: StudioRunToken;
  [Symbol.dispose](): void;
}

export interface StudioPluginFilter {
  readonly kind?: StudioPluginKindTag;
  readonly scope?: StudioPluginScope;
  readonly names?: readonly string[];
}

export const studioPluginId = (name: string): StudioPluginId => withBrand(`studio-plugin:${name}`, 'IncidentLabStudioPluginId');

export const studioPluginScope = (kind: StudioPluginKind, token: string): StudioPluginScope =>
  withBrand(`${kind}-plugin:${token}`, 'StudioPluginScope');

export const studioRunToken = (seed: string): StudioRunToken => withBrand(`run:${seed}`, 'IncidentLabStudioRunToken');

interface StoredPlugin {
  readonly plugin: AnyIncidentLabStudioPlugin;
}

export class IncidentLabStudioPluginRegistry<TCatalog extends readonly AnyIncidentLabStudioPlugin[]> implements AsyncDisposable {
  private readonly catalog = new Map<StudioPluginId, AnyIncidentLabStudioPlugin>();
  private readonly byName = new Map<string, StudioPluginId>();
  private readonly runAudit: PluginAuditRecord[] = [];
  private readonly handles = new Map<StudioPluginId, StoredPlugin>();
  private closed = false;

  public constructor(catalog: TCatalog) {
    for (const plugin of [...catalog]) {
      this.catalog.set(plugin.pluginId, plugin);
      this.byName.set(plugin.name, plugin.pluginId);
    }
  }

  private resolveFilter = (plugin: AnyIncidentLabStudioPlugin, filter: StudioPluginFilter): boolean => {
    if (filter.kind && plugin.kind !== filter.kind) return false;
    if (filter.scope && plugin.scope !== filter.scope) return false;
    if (filter.names?.length && !filter.names.includes(plugin.name)) return false;
    return true;
  };

  public get state(): StudioPluginCatalogState {
    return {
      total: this.catalog.size,
      plugins: [...this.catalog.keys()],
    };
  }

  public get auditTrail(): readonly PluginAuditRecord[] {
    return [...this.runAudit];
  }

  public list(filter: StudioPluginFilter = {}): readonly AnyIncidentLabStudioPlugin[] {
    const candidates = [...this.catalog.values()].filter((plugin) => this.resolveFilter(plugin, filter));
    return candidates.toSorted((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
  }

  public getByName<TKind extends StudioPluginKindTag>(name: string): AnyIncidentLabStudioPlugin | undefined {
    const pluginId = this.byName.get(name);
    return pluginId ? this.catalog.get(pluginId) : undefined;
  }

  public register<TPlugin extends AnyIncidentLabStudioPlugin>(
    plugin: NoInfer<TPlugin>,
  ): IncidentLabStudioPluginHandle<TPlugin> {
    const pluginId = plugin.pluginId;
    const previous = this.byName.get(plugin.name);
    if (previous) {
      this.catalog.delete(previous);
    }

    this.catalog.set(pluginId, plugin);
    this.byName.set(plugin.name, pluginId);

    const trace = studioRunToken(`${pluginId}:${Date.now()}`);
    let closed = false;
    const handle: IncidentLabStudioPluginHandle<TPlugin> = {
      pluginId,
      plugin,
      trace,
      [Symbol.dispose]: () => {
        if (closed) return;
        closed = true;
        this.catalog.delete(pluginId);
        this.byName.delete(plugin.name);
        this.handles.delete(pluginId);
      },
    };

    this.handles.set(pluginId, { plugin });
    return handle;
  }

  public remove(name: string): boolean {
    const pluginId = this.byName.get(name);
    if (!pluginId) return false;

    const removed = this.catalog.delete(pluginId);
    if (!removed) return false;

    const entry = this.handles.get(pluginId);
    entry?.plugin;
    this.byName.delete(name);
    this.handles.delete(pluginId);
    return true;
  }

  public async execute<const TPlugins extends readonly AnyIncidentLabStudioPlugin[], TInput>(
    plugins: NoInfer<TPlugins>,
    seed: NoInfer<TInput>,
    context: StudioPluginContext,
  ): Promise<StudioPluginRunChain<TPlugins, TInput>> {
    let current: unknown = seed;

    for (const plugin of plugins) {
      const output = await plugin.run(current, context);
      this.runAudit.push({
        pluginId: plugin.pluginId,
        name: plugin.name,
        input: current,
        output,
        at: context.startedAt,
      });
      current = output;
    }

    return current as StudioPluginRunChain<TPlugins, TInput>;
  }

  public snapshotRunState<T>(input: {
    readonly sessionId: StudioSessionId;
    readonly runId: string;
    readonly route: string;
    readonly stage: 'discovery' | 'compose' | 'schedule' | 'execute' | 'telemetry' | 'report';
    readonly outcome: IncidentLabStudioRunState<T>['outcome'];
    readonly payload: T;
  }): IncidentLabStudioRunState<T> {
    return {
      sessionId: input.sessionId,
      runId: withBrand(input.runId, 'IncidentLabStudioRunId'),
      route: withBrand(input.route, 'StudioRoute'),
      input: input.payload,
      startedAt: new Date().toISOString(),
      stage: input.stage,
      outcome: input.outcome,
    };
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    for (const handle of this.handles.keys()) {
      const plugin = this.handles.get(handle);
      if (plugin) {
        this.catalog.delete(handle);
      }
    }

    this.catalog.clear();
    this.byName.clear();
    this.handles.clear();
    this.runAudit.length = 0;
  }
}

export const buildDefaultPlugins = (): readonly AnyIncidentLabStudioPlugin[] => {
  const discoveryScope = studioPluginScope('topology', 'bootstrap');

  const discovery: AnyIncidentLabStudioPlugin = {
    pluginId: studioPluginId('discovery-plugin'),
    name: 'discovery-plugin',
    kind: 'topology-plugin',
    scope: discoveryScope,
    version: '1.0.0',
    priority: 10,
    consumes: ['topology'],
    produces: ['scenario'],
    context: 'topology-plugin',
    run: (input: { readonly discoveredAt: string }, pluginContext) => ({
      ...input,
      discoveredAt: pluginContext.startedAt,
      plugin: 'discovery',
    }),
  };

  const planner: AnyIncidentLabStudioPlugin = {
    pluginId: studioPluginId('planner-plugin'),
    name: 'planner-plugin',
    kind: 'planner-plugin',
    scope: studioPluginScope('planner', 'planner'),
    version: '1.0.0',
    priority: 20,
    consumes: ['scenario'],
    produces: ['plan'],
    context: 'planner-plugin',
    run: (input: { readonly discoveredAt: string }, pluginContext) => ({
      ...input,
      plannedAt: pluginContext.startedAt,
      plugin: 'planner',
    }),
  };

  const scheduler: AnyIncidentLabStudioPlugin = {
    pluginId: studioPluginId('scheduler-plugin'),
    name: 'scheduler-plugin',
    kind: 'scheduler-plugin',
    scope: studioPluginScope('scheduler', 'scheduler'),
    version: '1.0.0',
    priority: 30,
    consumes: ['plan'],
    produces: ['schedule'],
    context: 'scheduler-plugin',
    run: (input: { readonly plannedAt: string }, pluginContext) => ({
      ...input,
      scheduledAt: pluginContext.startedAt,
      plugin: 'scheduler',
    }),
  };

  const telemetry: AnyIncidentLabStudioPlugin = {
    pluginId: studioPluginId('telemetry-plugin'),
    name: 'telemetry-plugin',
    kind: 'telemetry-plugin',
    scope: studioPluginScope('telemetry', 'telemetry'),
    version: '1.0.0',
    priority: 40,
    consumes: ['schedule'],
    produces: ['telemetry'],
    context: 'telemetry-plugin',
    run: (input: { readonly scheduledAt: string }) => ({
      ...input,
      plugin: 'telemetry',
      observedAt: new Date().toISOString(),
    }),
  };

  const report: AnyIncidentLabStudioPlugin = {
    pluginId: studioPluginId('report-plugin'),
    name: 'report-plugin',
    kind: 'report-plugin',
    scope: studioPluginScope('report', 'report'),
    version: '1.0.0',
    priority: 50,
    consumes: ['telemetry'],
    produces: ['report'],
    context: 'report-plugin',
    run: (input: { readonly observedAt: string }) => ({
      ...input,
      plugin: 'report',
      reportAt: new Date().toISOString(),
    }),
  };

  const policy: AnyIncidentLabStudioPlugin = {
    pluginId: studioPluginId('policy-plugin'),
    name: 'policy-plugin',
    kind: 'policy-plugin',
    scope: studioPluginScope('policy', 'policy'),
    version: '1.0.0',
    priority: 60,
    consumes: ['report'],
    produces: ['policy'],
    context: 'policy-plugin',
    run: (input: { readonly reportAt: string }) => ({
      ...input,
      plugin: 'policy',
      policyId: `policy:${reportAtSanitize(input.reportAt)}`,
    }),
  };

  return [discovery, planner, scheduler, telemetry, report, policy] as const;
};

const reportAtSanitize = (value: string): string =>
  value.replace(/[^a-zA-Z0-9:\-]/g, '-');
