import { type Brand, type NoInfer, type Prettify } from '@shared/type-level';

export type LabNamespace = `recovery-lab-console-labs`;
export const LAB_NAMESPACE = 'recovery-lab-console-labs' as const satisfies LabNamespace;

export type LabTenantId = Brand<string, 'LabTenantId'>;
export type LabWorkspaceId = Brand<string, 'LabWorkspaceId'>;
export type LabRunId = Brand<string, 'LabRunId'>;
export type LabPluginId = Brand<string, 'LabPluginId'>;
export type LabPluginName = Brand<string, 'LabPluginName'>;
export type LabBlueprintId = Brand<string, 'LabBlueprintId'>;
export type LabOperator = Brand<string, 'LabOperator'>;

export type ControlLabVerb = 'collect' | 'validate' | 'simulate' | 'synthesize' | 'audit';
export type ControlLabDomain = 'topology' | 'signal' | 'policy' | 'incident' | 'compliance' | 'forecast';
export type ControlLabCategory = 'telemetry' | 'planner' | 'simulator' | 'advice' | 'observer';
export type ControlLabTransport = 'inproc' | 'kafka' | 'eventbridge' | 'ws';
export type ControlLabKind<TScope extends string = string> = `${LabNamespace}::${TScope}`;
export type ControlLabTopic<TScope extends string = string> = `${TScope}:${ControlLabVerb}`;
export type PluginEventTopic = `plugin.${string}`;
export type StageTrace<T extends ControlLabVerb> = `${T}::${string}`;
export type TraceRoute<TSteps extends readonly string[]> = TSteps extends readonly [infer Head extends string, ...infer Rest extends readonly string[]]
  ? `${Head}::${TraceRoute<Rest>}`
  : never;

export const asLabTenantId = <T extends string>(value: T): LabTenantId => value as unknown as LabTenantId;
export const asLabWorkspaceId = <T extends string>(value: T): LabWorkspaceId => value as unknown as LabWorkspaceId;
export const asLabRunId = <T extends string>(value: T): LabRunId => value as unknown as LabRunId;
export const asLabPluginId = <T extends string>(value: T): LabPluginId => value as unknown as LabPluginId;
export const asLabPluginName = <T extends string>(value: T): LabPluginName => value as unknown as LabPluginName;
export const asLabBlueprintId = <T extends string>(value: T): LabBlueprintId => value as unknown as LabBlueprintId;
export const asLabOperator = <T extends string>(value: T): LabOperator => value as unknown as LabOperator;

export const defaultVerbs = ['collect', 'validate', 'simulate', 'synthesize', 'audit'] as const satisfies readonly ControlLabVerb[];
export const defaultDomains = ['topology', 'signal', 'policy', 'incident', 'compliance', 'forecast'] as const satisfies readonly ControlLabDomain[];
export const defaultCategories = ['telemetry', 'planner', 'simulator', 'advice', 'observer'] as const satisfies readonly ControlLabCategory[];
export const defaultTransports = ['inproc', 'kafka', 'ws', 'eventbridge'] as const satisfies readonly ControlLabTransport[];

export interface ControlLabEnvelope<T> {
  readonly payload: T;
  readonly tenantId: LabTenantId;
  readonly emittedAt: string;
  readonly spanId: string;
}

export interface ControlLabContext<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly runId: LabRunId;
  readonly tenantId: LabTenantId;
  readonly workspaceId: LabWorkspaceId;
  readonly operator: LabOperator;
  readonly pluginId: LabPluginId;
  readonly signature: string;
  readonly context: TMetadata;
}

export interface ControlLabPlugin<
  TName extends string = string,
  TKind extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends readonly string[] = readonly string[],
  TEmits extends readonly string[] = readonly string[],
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: LabPluginId;
  readonly name: LabPluginName & TName;
  readonly kind: TKind;
  readonly topic: PluginEventTopic;
  readonly verbs: TConsumes;
  readonly emits: TEmits;
  readonly category: ControlLabCategory;
  readonly domain: ControlLabDomain;
  readonly dependencies: readonly LabPluginId[];
  readonly stage: ControlLabVerb;
  readonly transport: ControlLabTransport;
  readonly weight: number;
  readonly metadata: Prettify<TMeta>;
  run(input: NoInfer<TInput>, context: ControlLabContext<TMeta>): Promise<PluginResult<TOutput>>;
}

export interface PluginResult<T> {
  readonly status: 'passed' | 'skipped' | 'failed';
  readonly output: T;
  readonly emitted: boolean;
  readonly notes: readonly string[];
}

export type PluginInput<TPlugin> = TPlugin extends ControlLabPlugin<
  infer _Name,
  infer _Kind,
  infer TInput,
  infer _TOutput,
  infer _TConsumes,
  infer _TEmits,
  infer _TMeta
>
  ? TInput
  : never;

export type PluginOutput<TPlugin> = TPlugin extends ControlLabPlugin<
  infer _Name,
  infer _Kind,
  infer _TInput,
  infer TOutput,
  infer _TConsumes,
  infer _TEmits,
  infer _TMeta
>
  ? TOutput
  : never;

export type PluginInputChain<TChain extends readonly ControlLabPlugin[]> = TChain extends readonly [
  infer Head extends ControlLabPlugin,
  ...infer Tail extends readonly ControlLabPlugin[],
]
  ? readonly [PluginInput<Head>, ...PluginInputChain<Tail>]
  : readonly [];

export type PluginOutputChain<TChain extends readonly ControlLabPlugin[]> = TChain extends readonly [
  infer Head extends ControlLabPlugin,
  ...infer Tail extends readonly ControlLabPlugin[],
]
  ? Tail extends readonly []
    ? readonly [PluginOutput<Head>]
    : readonly [PluginOutput<Head>, ...PluginOutputChain<Tail>]
  : readonly [];

export type PluginTailOutput<TChain extends readonly ControlLabPlugin[]> =
  TChain extends readonly [infer Head extends ControlLabPlugin, ...infer Tail extends readonly ControlLabPlugin[]]
    ? Tail extends readonly []
      ? PluginOutput<Head>
      : PluginTailOutput<Tail>
    : never;

export type PluginStageMap<TPlugins extends readonly ControlLabPlugin[]> = {
  [Plugin in TPlugins[number] as Plugin['kind']]: {
    readonly id: Plugin['id'];
    readonly topic: Plugin['topic'];
    readonly verbs: Plugin['verbs'];
  };
};

export type RemapByTopic<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord as K extends `${string}:${infer Tail}` ? Tail : never]: TRecord[K];
};

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTuple<Tail & readonly unknown[]>]
  : readonly [];

export type TracePoint = (s: string) => `${string}::${string}`;

export type ControlLabBlueprint<TSignals extends readonly string[] = readonly string[]> = {
  readonly blueprintId: LabBlueprintId;
  readonly tenantId: LabTenantId;
  readonly workspaceId: LabWorkspaceId;
  readonly signalClasses: TSignals;
  readonly stageOrder: readonly ControlLabVerb[];
  readonly operator: LabOperator;
  readonly startedAt: string;
  readonly pluginKinds: readonly string[];
};

export interface ControlLabRuntimeEvent<TPayload = unknown> {
  readonly kind: `${ControlLabVerb}/${LabNamespace}`;
  readonly runId: LabRunId;
  readonly payload: TPayload;
  readonly trace: string;
}

export interface ControlLabTimeline {
  readonly runId: LabRunId;
  readonly durationMs: number;
  readonly events: readonly ControlLabRuntimeEvent[];
  readonly stages: readonly ControlLabVerb[];
  readonly diagnostics: readonly string[];
}

export interface LabRunOutput<TOutput = unknown> {
  readonly runId: LabRunId;
  readonly elapsedMs: number;
  readonly blueprintId: LabBlueprintId;
  readonly output: TOutput;
  readonly timeline: ControlLabTimeline;
}

export interface ControlLabRuntimeOptions {
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly allowPartial?: boolean;
}

export const controlLabStageKey = <TVerb extends ControlLabVerb>(verb: TVerb): StageTrace<TVerb> =>
  `${verb}::${Date.now()}` as StageTrace<TVerb>;

export const buildBlueprintId = (tenantId: string, workspaceId: string): LabBlueprintId =>
  asLabBlueprintId(`${tenantId}::${workspaceId}::lab`);

export const buildRunId = (tenantId: string, signal: string): LabRunId => asLabRunId(`${tenantId}:${signal}:${Date.now()}`);

export const buildPluginId = (name: string, domain: ControlLabDomain): LabPluginId => asLabPluginId(`${domain}.${name}.plugin`);

export const pluginKeyFor = <TPlugin extends ControlLabPlugin>(plugin: TPlugin): `${TPlugin['kind']}::${TPlugin['name']}` =>
  `${plugin.kind}::${plugin.name}` as const;

export const pluginKindFrom = <T extends string>(value: T): ControlLabKind<T> => `recovery-lab-console-labs::${value}` as ControlLabKind<T>;

export const pluginTopicFor = <TKind extends string>(topic: TKind): PluginEventTopic => `plugin.${topic}` as PluginEventTopic;

export const runEventLabel = <TVerb extends ControlLabVerb>(verb: TVerb): `${TVerb}:trace` => `${verb}:trace` as const;

export const buildEventRoute = <TVerb extends ControlLabVerb>(runId: LabRunId, verb: TVerb): StageTrace<TVerb> =>
  `${runId}:${verb}` as StageTrace<TVerb>;

export const inferTopicVerb = <T extends PluginEventTopic>(topic: T): ControlLabVerb | null => {
  const parts = topic.split(':');
  const verb = parts.at(-1) as string;
  return (defaultVerbs as readonly string[]).includes(verb) ? (verb as ControlLabVerb) : null;
};

export const pluginDomainFor = (topic: ControlLabTopic): ControlLabDomain => {
  const [domain] = topic.split(':') as [ControlLabDomain, ControlLabVerb];
  return defaultDomains.includes(domain) ? domain : 'topology';
};

export const buildTimelineRoute = (runId: LabRunId, events: readonly string[]): TraceRoute<string[]> =>
  events.length > 0 ? `${runId}::${events.join('=>')}` as TraceRoute<string[]> : (runEventLabel('collect') as TraceRoute<string[]>);

export const defaultTimelineRoute = buildTimelineRoute;

export type PluginDependencyGraph<T extends readonly ControlLabPlugin[]> = {
  [K in T[number] as K['id']]: {
    readonly dependsOn: K['dependencies'];
    readonly topic: K['topic'];
    readonly stage: K['stage'];
  };
};
