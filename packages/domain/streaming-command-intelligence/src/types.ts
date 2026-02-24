import { Brand, NoInfer, Prettify, RecursivePath } from '@shared/type-level';
import { StreamId } from '@domain/streaming-engine';
import { StreamHealthSignal } from '@domain/streaming-observability';

export const commandNamespaces = ['ingest', 'analyze', 'synthesize', 'execute', 'verify', 'rollback'] as const;
export type CommandNamespace = (typeof commandNamespaces)[number];
export type CommandPluginKind = `${CommandNamespace}-plugin`;

export type StreamCommandPluginId = Brand<string, 'StreamingCommandPluginId'>;
export type CommandPolicyId = Brand<string, 'StreamingCommandPolicyId'>;
export type CommandTenantId = Brand<string, 'StreamingCommandTenantId'>;
export type CommandPlanId = Brand<string, 'StreamingCommandPlanId'>;
export type CommandTraceId = Brand<string, 'StreamingCommandTraceId'>;
export type CommandEnvelopeId = Brand<string, 'StreamingCommandEnvelopeId'>;
export type CommandStepId = Brand<string, 'StreamingCommandStepId'>;
export type CommandResultId = Brand<string, 'StreamingCommandResultId'>;

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'suppressed';
export type SeverityLevel = 1 | 2 | 3 | 4 | 5;
export type ChannelTag<T extends string = string> = `stream-command.${T}`;
export type SignalBus<T extends string = string> = `signals.${T}`;

export interface BrandTuple<T extends string, B extends string> {
  readonly value: Brand<T, B>;
}

export type TopologyRole = 'ingest' | 'analyze' | 'synthesize' | 'execute' | 'verify' | 'rollback';

export interface CommandTopologyNode {
  readonly id: Brand<string, 'StreamingCommandTopologyNode'>;
  readonly name: string;
  readonly criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface CommandTopologyEdge {
  readonly from: CommandTopologyNode['id'];
  readonly to: CommandTopologyNode['id'];
  readonly latencyBudgetMs: number;
}

export interface CommandTopology {
  readonly streamId: StreamId;
  readonly nodes: readonly CommandTopologyNode[];
  readonly edges: readonly CommandTopologyEdge[];
  readonly generatedAt: string;
}

export interface PluginManifest<
  TName extends string,
  TKind extends CommandPluginKind,
  TConsumes extends readonly ChannelTag[] = readonly ChannelTag[],
  TEmits extends readonly SignalBus[] = readonly SignalBus[],
  TConfig = Record<string, unknown>,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly pluginId: StreamCommandPluginId;
  readonly name: TName;
  readonly kind: TKind;
  readonly namespace: CommandNamespace;
  readonly version: `${number}.${number}.${number}`;
  readonly consumes: TConsumes;
  readonly emits: TEmits;
  readonly config: TConfig;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface StreamingCommandPlugin<
  TName extends string,
  TKind extends CommandPluginKind,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends readonly ChannelTag[] = readonly ChannelTag[],
  TEmits extends readonly SignalBus[] = readonly SignalBus[],
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> extends PluginManifest<TName, TKind, TConsumes, TEmits, TConfig, TInput, TOutput> {
  readonly run: (input: NoInfer<TInput>, context: CommandExecutionContext) => Promise<TOutput>;
}

export interface CommandPlanStepDescriptor<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
  TConsumes extends readonly ChannelTag[] = readonly ChannelTag[],
  TEmits extends readonly SignalBus[] = readonly SignalBus[],
  TKind extends CommandPluginKind = CommandPluginKind,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> extends PluginManifest<string, TKind, TConsumes, TEmits, TConfig, TInput, TOutput> {
  readonly stepId: CommandStepId;
  readonly latencyBudgetMs: number;
  readonly behavior: 'echo' | 'augment' | 'transform';
}

export interface CommandPlanStep {
  readonly id: CommandStepId;
  readonly namespace: CommandNamespace;
  readonly name: string;
  readonly pluginKind: CommandPluginKind;
  readonly latencyBudgetMs: number;
  readonly priority: number;
}

export type AnyStreamingCommandPlugin = StreamingCommandPlugin<string, CommandPluginKind, unknown, unknown>;
export type PluginByKind<TCatalog extends readonly AnyStreamingCommandPlugin[], TKind extends CommandPluginKind> = Extract<
  TCatalog[number],
  { kind: TKind }
>;

export interface CommandExecutionContext {
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly traceId: CommandTraceId;
  readonly runId: CommandPlanId;
  readonly pluginName: string;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface CommandRunContext {
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly planId: CommandPlanId;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly commandCount: number;
}

export interface CommandRunResult<TOutput = unknown> {
  readonly status: RunStatus;
  readonly traceId: CommandTraceId;
  readonly resultId: CommandResultId;
  readonly streamId: StreamId;
  readonly output: TOutput;
  readonly score: CommandScore;
  readonly warnings: readonly string[];
  readonly tags: readonly ChannelTag[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CommandPolicy {
  readonly id: CommandPolicyId;
  readonly name: string;
  readonly priority: number;
  readonly tags: readonly string[];
  readonly allowedNamespaces: readonly CommandNamespace[];
  readonly requires: readonly ChannelTag[];
  readonly emits: readonly SignalBus[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CommandRunPlan<TConfig = unknown> {
  readonly planId: CommandPlanId;
  readonly name: string;
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly plugins: readonly CommandPlanStepDescriptor[];
  readonly expectedDurationMs: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly config: TConfig;
}

export type CommandPlan = CommandRunPlan<Record<string, unknown>>;

export interface CommandSignalContext {
  readonly pluginId?: StreamCommandPluginId;
  readonly pluginName?: string;
  readonly latencyMs?: number;
  readonly status?: RunStatus;
  readonly runId?: CommandPlanId;
  readonly message?: string;
}

export interface CommandSignalEnvelope<TPayload = unknown, TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly namespace: CommandNamespace;
  readonly envelopeId: CommandEnvelopeId;
  readonly traceId: CommandTraceId;
  readonly pluginKind: CommandPluginKind;
  readonly tags: readonly ChannelTag[];
  readonly seenAt: string;
  readonly payload: TPayload;
  readonly context: Prettify<
    TContext & {
      pluginId?: StreamCommandPluginId;
      pluginName?: string;
      latencyMs?: number;
      status?: RunStatus;
      runId?: CommandPlanId;
      message?: string;
    }
  >;
  readonly signals: readonly StreamHealthSignal[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type CommandSignalContextTuple = readonly [StreamCommandPluginId, string, CommandStepId];

export interface CommandSignalRecord<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly envelopeId: CommandEnvelopeId;
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly namespace: CommandNamespace;
  readonly payload: TPayload;
  readonly context: CommandSignalContextTuple;
}

export interface CommandPolicyConstraint {
  readonly policyId: CommandPolicyId;
  readonly namespace: CommandNamespace;
  readonly required: boolean;
  readonly weight: number;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly severity?: CommandPolicyByPriority<number>;
}

export interface CommandScore {
  readonly score: number;
  readonly confidence: number;
  readonly severity: SeverityLevel;
}

export interface TopologyNode {
  readonly id: Brand<string, 'StreamingCommandTopologyNodeId'>;
  readonly role: TopologyRole;
}

export interface TopologyEdge {
  readonly from: TopologyNode['id'];
  readonly to: TopologyNode['id'];
  readonly latencyBudgetMs: number;
}

export type PluginInput<TPlugin extends AnyStreamingCommandPlugin> = TPlugin extends StreamingCommandPlugin<
  string,
  CommandPluginKind,
  infer TInput,
  unknown,
  any,
  any
>
  ? TInput
  : never;

export type PluginOutput<TPlugin extends AnyStreamingCommandPlugin> = TPlugin extends StreamingCommandPlugin<
  string,
  CommandPluginKind,
  unknown,
  infer TOutput,
  any,
  any
>
  ? TOutput
  : never;

export type CommandPath<T> = T extends Record<string, unknown> ? RecursivePath<T> : never;

export type RecursiveTuple<T, Depth extends number, Acc extends readonly T[] = []> = Acc['length'] extends Depth
  ? Acc
  : RecursiveTuple<T, Depth, [...Acc, T]>;

export type CommandSignalTuple = CommandSignalRecord & { readonly index: string };

export type SignalBusTag<TPayload extends Record<string, string>> = {
  [K in keyof TPayload as K extends string ? `payload:${K}` : never]: TPayload[K];
};

export type StepTuple<T extends readonly CommandPlanStep[]> = {
  [Index in keyof T as Index extends `${number}` ? `step:${Index & number}` : never]: T[Index];
};

export type PluginIndex<TCatalog extends readonly AnyStreamingCommandPlugin[]> = {
  [P in TCatalog[number] as `plugin:${P['kind']}:${P['name']}`]: P;
};

export type StepPair<TCatalog extends readonly AnyStreamingCommandPlugin[]> = {
  [P in TCatalog[number] as `step:${P['kind']}`]: P extends StreamingCommandPlugin<string, any, infer TInput, infer TOutput>
    ? (input: TInput, context: CommandExecutionContext) => Promise<TOutput>
    : never;
};

export type CommandPolicyByPriority<TPriority extends number> = number extends TPriority
  ? 'minimal' | 'normal' | 'aggressive'
  : TPriority extends 1 | 2
  ? 'minimal'
  : TPriority extends 3 | 4
    ? 'normal'
    : 'aggressive';

export type ConstraintBand = CommandPolicyByPriority<number>;

export type NamespaceBuckets = {
  readonly [K in CommandNamespace]?: readonly CommandTopologyNode['id'][];
};

export type StepDescriptorTuple<TSteps extends readonly string[]> = {
  [K in keyof TSteps]: {
    readonly index: K & number;
    readonly step: TSteps[K] & string;
    readonly namespace: CommandNamespace;
    readonly stepId: CommandStepId;
  };
};

export const asCommandTenantId = (value: string): CommandTenantId => value as CommandTenantId;
export const asStreamId = (value: string): StreamId => value as StreamId;
export const asCommandPlanId = (value: string): CommandPlanId => value as CommandPlanId;
export const asCommandPolicyId = (value: string): CommandPolicyId => value as CommandPolicyId;
export const asCommandTraceId = (value: string): CommandTraceId => value as CommandTraceId;
export const asCommandPluginId = (value: string): StreamCommandPluginId => value as StreamCommandPluginId;
export const asCommandEnvelopeId = (value: string): CommandEnvelopeId => value as CommandEnvelopeId;
export const asCommandStepId = (value: string): CommandStepId => value as CommandStepId;
export const asCommandResultId = (value: string): CommandResultId => value as CommandResultId;

export const asCommandTag = (value: string): ChannelTag =>
  value.startsWith('stream-command.') ? value as ChannelTag : `stream-command.${value}` as ChannelTag;

export const asSignalBus = (value: string): SignalBus =>
  value.startsWith('signals.') ? value as SignalBus : `signals.${value}` as SignalBus;

export const resolvePolicyBand = <TPriority extends number>(
  priority: TPriority,
): CommandPolicyByPriority<TPriority> => {
  if (priority <= 2) return 'minimal' as CommandPolicyByPriority<TPriority>;
  if (priority <= 4) return 'normal' as CommandPolicyByPriority<TPriority>;
  return 'aggressive' as CommandPolicyByPriority<TPriority>;
};

export type WithRunId<T extends { runId?: CommandPlanId }> = T & { readonly runId: CommandPlanId };
export type PlanPluginKind<TPlan extends readonly CommandPlanStepDescriptor[]> = TPlan[number]['kind'];
export type PlanNamespace<TPlan extends readonly CommandPlanStepDescriptor[]> = TPlan[number]['namespace'];
export type PlanStepIndex<TPlan extends readonly CommandPlanStepDescriptor[]> = {
  readonly [Name in TPlan[number] as Name['name']]: Name;
};

export const planNamespaceTuple = <TSteps extends readonly CommandPlanStepDescriptor[]>(steps: TSteps): readonly PlanNamespace<TSteps>[] =>
  steps.map((step) => step.namespace) as readonly PlanNamespace<TSteps>[];

export const asStepMap = <TPlan extends readonly CommandPlanStepDescriptor[]>(plan: TPlan): PlanStepIndex<TPlan> =>
  Object.fromEntries(
    plan.map((step) => [step.name, step]),
  ) as PlanStepIndex<TPlan>;
