import { z } from 'zod';
import type { DeepReadonly, NoInfer, Prettify, RecursivePath } from '@shared/type-level';
import {
  syntheticBuildDefaults,
  syntheticDomain,
  syntheticPhaseBudgetsMs,
  syntheticPhases,
  syntheticPriorityBands,
  syntheticStatuses,
  syntheticRunPrefix,
  type SyntheticBlueprintId,
  type SyntheticCorrelationId,
  type SyntheticDomainNamespace,
  type SyntheticEventPath,
  type SyntheticPhase,
  type SyntheticPluginId,
  type SyntheticPriorityBand,
  type SyntheticRunId,
  type SyntheticTenantId,
  type SyntheticWorkspaceId,
  type SyntheticStatus,
} from './constants';
export {
  syntheticBuildDefaults,
  syntheticDomain,
  syntheticPhaseBudgetsMs,
  syntheticPhases,
  syntheticPriorityBands,
  syntheticRunPrefix,
  syntheticStatuses,
} from './constants';
export type {
  SyntheticBlueprintId,
  SyntheticCorrelationId,
  SyntheticDomainNamespace,
  SyntheticEventPath,
  SyntheticPhase,
  SyntheticPluginId,
  SyntheticPriorityBand,
  SyntheticRunId,
  SyntheticTenantId,
  SyntheticWorkspaceId,
  SyntheticStatus,
} from './constants';

export const syntheticRunEventChannel = `${syntheticDomain}-events` as const;

export type SyntheticEventChannel = `${SyntheticDomainNamespace}:${SyntheticPhase}:${string}`;
export type PhaseDiagnosticTag<TPhase extends SyntheticPhase> = `${SyntheticDomainNamespace}:${TPhase}`;
export type PluginRuntimeChannel<TName extends string> = `${typeof syntheticDomain}.plugin.${TName}`;
export type PluginOutputChannel<TName extends string> = `${typeof syntheticDomain}.output.${TName}`;
export type BlueprintTemplate<T extends string> = `${string}::${T}::${SyntheticPhase}`;
export type TenantAlias<T extends string> = `${T}.tenant`;

export interface SyntheticActor {
  readonly tenantId: SyntheticTenantId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly actorId: string;
  readonly alias?: TenantAlias<string>;
}

export interface SyntheticExecutionContext {
  readonly tenantId: SyntheticTenantId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly runId: SyntheticRunId;
  readonly correlationId: SyntheticCorrelationId;
  readonly actor: string;
  readonly startedAt: string;
  readonly traceTags: readonly string[];
  readonly phaseBudget: Record<SyntheticPhase, number>;
}

export interface SyntheticPluginResult<TPayload = unknown> {
  readonly ok: boolean;
  readonly payload?: TPayload;
  readonly diagnostics: readonly string[];
  readonly warnings: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface SyntheticPluginConfigEnvelope<T extends Record<string, unknown>> {
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly enabled: boolean;
  readonly parameters: T;
}

export interface SyntheticPluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TPhase extends SyntheticPhase = SyntheticPhase,
  TInputTemplate extends string = string,
> {
  readonly id: SyntheticPluginId;
  readonly domain: SyntheticDomainNamespace;
  readonly name: TInputTemplate & string;
  readonly phase: TPhase;
  readonly requires: readonly SyntheticPluginId[];
  readonly weight: number;
  readonly timeoutMs: number;
  readonly priority: SyntheticPriorityBand;
  readonly channel: PluginRuntimeChannel<TInputTemplate>;
  readonly metadata: Readonly<Record<string, string>>;
  readonly config: TConfig;
  execute(
    input: TInput,
    context: SyntheticExecutionContext,
    config: NoInfer<TConfig>,
  ): Promise<SyntheticPluginResult<TOutput>>;
}

export type PluginInput<TPlugin> = TPlugin extends SyntheticPluginDefinition<
  infer TInput,
  unknown,
  Record<string, unknown>,
  SyntheticPhase,
  string
>
  ? TInput
  : never;

export type PluginOutput<TPlugin> = TPlugin extends SyntheticPluginDefinition<
  unknown,
  infer TOutput,
  Record<string, unknown>,
  SyntheticPhase,
  string
>
  ? TOutput
  : never;

export type PluginName<TPlugin> = TPlugin extends SyntheticPluginDefinition<
  unknown,
  unknown,
  Record<string, unknown>,
  SyntheticPhase,
  infer TName
>
  ? TName & string
  : never;

export type PluginInputMap<TPlugins extends readonly SyntheticPluginDefinition[]> = {
  [TPlugin in TPlugins[number] as TPlugin['id'] & string]: PluginInput<TPlugin>;
};

export type PluginByName<TPlugins extends readonly SyntheticPluginDefinition[]> = {
  [TPlugin in TPlugins[number] as PluginName<TPlugin>]: TPlugin;
};

export type PluginByPhase<TPlugins extends readonly SyntheticPluginDefinition[]> = {
  [TPhase in SyntheticPhase]?: TPlugins[number][];
};

export type PluginOutputByPhase<TPlugins extends readonly SyntheticPluginDefinition[]> = {
  [TPlugin in TPlugins[number] as TPlugin['phase']]: Extract<TPlugins[number], { phase: TPlugin['phase'] }>['id'];
};

export type PluginChainCompatibility<TChain extends readonly SyntheticPluginDefinition[]> = TChain;

export type PluginChainInput<TChain extends readonly SyntheticPluginDefinition[]> = TChain extends readonly [
  infer THead,
  ...readonly SyntheticPluginDefinition[],
]
  ? THead extends SyntheticPluginDefinition
    ? PluginInput<THead>
    : never
  : never;

export type PluginChainOutput<TChain extends readonly SyntheticPluginDefinition[]> = TChain extends readonly [
  ...readonly SyntheticPluginDefinition[],
  infer TTail,
]
  ? TTail extends SyntheticPluginDefinition
    ? PluginOutput<TTail>
    : never
  : never;

export type ChainPath<TChain extends readonly SyntheticPluginDefinition[]> = {
  [K in keyof TChain]: TChain[K] extends SyntheticPluginDefinition
    ? PluginRuntimeChannel<PluginName<NoInfer<TChain[K]>>>
    : never;
};

export interface SyntheticBlueprint {
  readonly id: SyntheticBlueprintId;
  readonly tenantId: SyntheticTenantId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly name: string;
  readonly domain: typeof syntheticDomain;
  readonly owner: string;
  readonly tags: readonly string[];
  readonly phases: readonly SyntheticPhase[];
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly goal: 'stability' | 'performance' | 'cost-optimization' | 'risk-reduction';
  readonly inputSchema?: Record<string, unknown>;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface SynthesizerInput {
  readonly scenario: string;
  readonly constraints: Record<string, unknown>;
  readonly requestedBy: string;
  readonly priority: SyntheticPriorityBand;
}

export interface SynthesizerRunSnapshot {
  readonly sequence: readonly string[];
  readonly elapsedMs: number;
  readonly phase: SyntheticPhase;
}

export interface SyntheticRunOutcome<TPayload = unknown> {
  readonly runId: SyntheticRunId;
  readonly tenantId: SyntheticTenantId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly blueprintId: SyntheticBlueprintId;
  readonly status: SyntheticStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly summary: string;
  readonly metrics: {
    pluginCount: number;
    warningCount: number;
    phaseCount: number;
    snapshots: readonly SynthesizerRunSnapshot[];
  };
  readonly output: TPayload;
}

export type RunEvent<TPayload = unknown> = {
  readonly kind: `${SyntheticDomainNamespace}:run:${'started' | 'progress' | 'finished'}`;
  readonly at: string;
  readonly payload: TPayload;
};

export interface SyntheticPlan<TPlugins extends readonly SyntheticPluginDefinition[]> {
  readonly runId: SyntheticRunId;
  readonly phases: readonly SyntheticPhase[];
  readonly pluginChain: PluginChainCompatibility<TPlugins>;
  readonly createdAt: string;
  readonly domain: typeof syntheticDomain;
}

export interface SyntheticPlanRequest<TPlugins extends readonly SyntheticPluginDefinition[]> {
  readonly blueprintId: SyntheticBlueprintId;
  readonly runId: SyntheticRunId;
  readonly requestedBy: string;
  readonly plugins: TPlugins;
  readonly plan: SyntheticPlan<TPlugins>;
}

export const syntheticBlueprintSchema = z.object({
  id: z.string().min(8),
  tenantId: z.string().min(3),
  workspaceId: z.string().min(3),
  name: z.string().min(1),
  domain: z.literal(syntheticDomain),
  owner: z.string().min(1),
  tags: z.array(z.string()).default([]),
  phases: z.array(z.enum(syntheticPhases as unknown as readonly [string, ...string[]])),
  requestedAt: z.string().datetime(),
  requestedBy: z.string().min(1),
  goal: z.enum(['stability', 'performance', 'cost-optimization', 'risk-reduction']),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export const syntheticRunInputSchema = z.object({
  scenario: z.string().min(1),
  constraints: z.record(z.string(), z.unknown()),
  requestedBy: z.string().min(1),
  priority: z.enum(syntheticPriorityBands as unknown as readonly [string, ...string[]]),
});

const runStatusSet = syntheticStatuses as unknown as readonly [string, ...string[]];
export const syntheticRunOutcomeSchema = z.object({
  runId: z.string().min(4),
  tenantId: z.string().min(3),
  workspaceId: z.string().min(3),
  blueprintId: z.string().min(4),
  status: z.enum(runStatusSet),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  summary: z.string(),
  metrics: z.object({
    pluginCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    phaseCount: z.number().int().nonnegative(),
    snapshots: z.array(
      z.object({
        sequence: z.array(z.string()),
        elapsedMs: z.number().nonnegative(),
        phase: z.string(),
      }),
    ),
  }),
  output: z.unknown(),
});

export type SyntheticBlueprintModel = z.infer<typeof syntheticBlueprintSchema>;
export type SyntheticRunInputModel = z.infer<typeof syntheticRunInputSchema>;
export type SyntheticRunOutcomeModel = z.infer<typeof syntheticRunOutcomeSchema>;

export const normalizeBudget = (phase: SyntheticPhase): number =>
  syntheticPhaseBudgetsMs[phase] ?? syntheticBuildDefaults.defaultTimeoutMs;

export const pluginOutputChannel = <TPluginName extends string>(name: TPluginName): PluginOutputChannel<TPluginName> =>
  `${syntheticDomain}.output.${name}`;

export const pluginDiagnosticTag = <TPluginName extends string>(name: TPluginName): PluginRuntimeChannel<TPluginName> =>
  `${syntheticDomain}.plugin.${name}`;

export const buildRuntimeContext = (options: {
  tenantId: SyntheticTenantId;
  workspaceId: SyntheticWorkspaceId;
  runId: SyntheticRunId;
  correlationId: SyntheticCorrelationId;
  actor: string;
  phase?: SyntheticPhase;
}): SyntheticExecutionContext => ({
  tenantId: options.tenantId,
  workspaceId: options.workspaceId,
  runId: options.runId,
  correlationId: options.correlationId,
  actor: options.actor,
  startedAt: new Date().toISOString(),
  traceTags: [syntheticRunEventChannel, options.phase ?? syntheticPhases[0]],
  phaseBudget: syntheticPhaseBudgetsMs,
});

export const toReadOnly = <T>(value: T): DeepReadonly<T> =>
  value as DeepReadonly<T>;

export const toPrettifiedBlueprint = (value: SyntheticBlueprint): Prettify<SyntheticBlueprint> =>
  ({ ...value }) satisfies Prettify<SyntheticBlueprint>;

export const buildPlanRequest = <TPlugins extends readonly SyntheticPluginDefinition[]>(
  options: {
    blueprintId: SyntheticBlueprintId;
    runId: SyntheticRunId;
    requestedBy: string;
    plugins: PluginChainCompatibility<TPlugins>;
  },
  _path: RecursivePath<SyntheticExecutionContext>,
): SyntheticPlanRequest<TPlugins> => ({
  blueprintId: options.blueprintId,
  runId: options.runId,
  requestedBy: options.requestedBy,
  plugins: options.plugins,
  plan: {
    runId: options.runId,
    phases: syntheticPhases,
    pluginChain: options.plugins as PluginChainCompatibility<TPlugins>,
    createdAt: new Date().toISOString(),
    domain: syntheticDomain,
  },
} as SyntheticPlanRequest<TPlugins>);

export const asSyntheticTenantId = (tenantId: string): SyntheticTenantId => tenantId as SyntheticTenantId;
export const asSyntheticWorkspaceId = (workspaceId: string): SyntheticWorkspaceId => workspaceId as SyntheticWorkspaceId;
export const asSyntheticRunId = (runId: string): SyntheticRunId => runId as SyntheticRunId;
export const asSyntheticBlueprintId = (blueprintId: string): SyntheticBlueprintId => blueprintId as SyntheticBlueprintId;
export const asSyntheticPluginId = (pluginId: string): SyntheticPluginId => pluginId as SyntheticPluginId;
export const asSyntheticCorrelationId = (correlationId: string): SyntheticCorrelationId => correlationId as SyntheticCorrelationId;
export const asSyntheticEventPath = (value: string): SyntheticEventPath => value as SyntheticEventPath;
