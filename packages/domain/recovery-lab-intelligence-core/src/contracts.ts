import type { Brand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type {
  StrategyLane,
  StrategyMode,
  StrategyPlan,
  StrategyPhase,
  StrategyResult,
  StrategyStep,
  StrategyTuple,
  SignalEvent,
  SessionRoute,
  WorkspaceId,
  SessionId,
  RunId,
  PlanId,
  ScenarioId,
  PluginId,
  PluginFingerprint,
  SeverityBand,
  SignalSource,
  StrategyContext,
} from './types';

export type PluginContract<
  TKind extends string,
  TInput = unknown,
  TOutput = unknown,
  TContext = unknown,
> = Readonly<{
  readonly kind: TKind;
  readonly id: Brand<string, 'IntelligencePlugin'>;
  readonly version: Brand<string, 'PluginVersion'>;
  readonly lane: StrategyLane;
  readonly mode: StrategyMode;
  readonly source: SignalSource;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly inputSchema: (value: unknown) => value is TInput;
  readonly run: (input: TInput, context: StrategyContext<TContext>) => Promise<TOutput>;
  readonly fingerprint: () => PluginFingerprint;
  readonly namespace: SessionRoute<StrategyMode>;
}>;

export type ContractKind<TContract extends PluginContract<string, any, any, any>> =
  TContract extends PluginContract<infer TKind, any, any, any> ? TKind : never;

export type ContractInput<TContract extends PluginContract<string, any, any, any>> =
  TContract extends PluginContract<string, infer TInput, any, any> ? TInput : never;

export type ContractOutput<TContract extends PluginContract<string, any, any, any>> =
  TContract extends PluginContract<string, any, infer TOutput, any> ? TOutput : never;

export type ContractContext<TContract extends PluginContract<string, any, any, any>> =
  TContract extends PluginContract<string, any, any, infer TContext> ? TContext : never;

export type ContractByKind<
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TKind extends string = string,
> = Extract<TContracts[number], { kind: TKind }>;

export type RegistryMap<TContracts extends readonly PluginContract<string, any, any, any>[]> = {
  [K in TContracts[number] as K['kind'] & string]: ContractByKind<TContracts, K['kind'] & string>;
};

export type PluginDescriptor<
  TContract extends PluginContract<string, any, any, any>,
  TOverrides extends Record<string, unknown> = Record<string, unknown>,
> = Readonly<
  {
    readonly key: `${TContract['kind']}:${TContract['id']}`;
    readonly contract: TContract;
    readonly route: TContract['namespace'];
    readonly label: string;
    readonly active: boolean;
    readonly aliases: readonly string[];
    readonly severity: SeverityBand;
    readonly timeoutMs: number;
    readonly retries: number;
  } & TOverrides
>;

export interface PluginExecutionRecord<
  TInput = unknown,
  TOutput = unknown,
  TContext = unknown,
> {
  readonly traceId: PluginId;
  readonly phase: StrategyMode;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly diagnostics: readonly SignalEvent[];
  readonly context: StrategyContext<TContext>;
}

export interface ExecutionPolicy {
  readonly continueOnError: boolean;
  readonly maxRetries: number;
  readonly backoffMs: number;
  readonly maxTimeoutMs: number;
}

export interface PluginRegistryInput<TContracts extends readonly PluginContract<string, any, any, any>[]> {
  readonly workspace: WorkspaceId;
  readonly policies: Readonly<Record<StrategyLane, ExecutionPolicy>>;
  readonly contracts: TContracts;
  readonly contextFactory: () => StrategyContext;
}

export interface PluginExecutionResult<TOutput> {
  readonly output: TOutput;
  readonly fingerprint: PluginFingerprint;
  readonly consumedMs: number;
  readonly warnings: readonly string[];
  readonly diagnostics: readonly SignalEvent[];
}

export interface PluginExecutionReport<TOutput = unknown> extends PluginExecutionResult<TOutput> {
  readonly plugin: PluginId;
  readonly kind: string;
  readonly ok: boolean;
}

export type RecursivePluginTuple<
  TInput,
  TContracts extends readonly PluginContract<string, any, any, any>[],
> = TContracts extends readonly [infer Head extends PluginContract<string, any, any, any>, ...infer Tail extends PluginContract<string, any, any, any>[]]
  ? readonly [
      PluginExecutionReport<ContractOutput<Head>>,
      ...RecursivePluginTuple<ContractOutput<Head>, Tail>,
    ]
  : readonly [];

export type PluginTupleInputs<
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TSeed,
  _Acc = TSeed,
> = TContracts extends readonly [infer Head extends PluginContract<string, any, any, any>, ...infer Tail extends PluginContract<string, any, any, any>[]]
  ? PluginTupleInputs<Tail, ContractOutput<Head>, readonly [ContractInput<Head>, _Acc]>
  : readonly [_Acc];

export type ChainTuple<TContracts extends readonly PluginContract<string, any, any, any>[], TSeed> =
  TContracts extends readonly [infer Head extends PluginContract<string, any, any, any>, ...infer Tail extends PluginContract<string, any, any, any>[]]
    ? readonly [Head, ...ChainTuple<Tail, ContractOutput<Head>>]
    : readonly [];

export type StrategyFlow<
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TSeed = unknown,
  TPlan extends StrategyPlan = StrategyPlan,
> = {
  readonly chain: ChainTuple<TContracts, TSeed>;
  readonly steps: readonly StrategyStep<unknown>[];
  readonly plan: TPlan;
};

export interface StrategyExecutionOptions {
  readonly tenant: WorkspaceId;
  readonly dryRun: boolean;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
}

export interface OrchestrationResult<TOutput = unknown> extends StrategyResult<TOutput> {
  readonly flow: readonly PluginExecutionRecord[];
  readonly report: {
    readonly pluginCount: number;
    readonly warningCount: number;
    readonly errorCount: number;
    readonly outputSize: number;
  };
}

export interface PluginEngineInput<TContracts extends readonly PluginContract<string, any, any, any>[], TSeed> {
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
  readonly runId: RunId;
  readonly planId: PlanId;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly tuple: StrategyTuple;
  readonly contracts: TContracts;
  readonly seed: TSeed;
}

export interface PluginEngineOutput<TContracts extends readonly PluginContract<string, any, any, any>[], TSeed> {
  readonly outcome: OrchestrationResult<ContractOutput<TContracts[number]>>;
  readonly plan: StrategyPlan;
  readonly steps: readonly PluginExecutionReport[];
  readonly chain: TContracts;
  readonly seed: TSeed;
}

export const buildContractNamespace = <TKind extends string>(kind: TKind, mode: StrategyMode): SessionRoute<StrategyMode> => {
  return `${kind}:${mode}:${Date.now()}` as SessionRoute<StrategyMode>;
};

export const buildDescriptor = <TContract extends PluginContract<string, any, any, any>>(
  contract: NoInfer<TContract>,
  label: string,
  overrides: Readonly<Record<string, unknown>> = {},
): PluginDescriptor<TContract> => ({
  key: `${contract.kind}:${contract.id}`,
  contract,
  route: contract.namespace,
  label,
  active: true,
  aliases: [contract.kind],
  severity: 'info',
  timeoutMs: 1000,
  retries: 0,
  ...overrides,
});

export const chainHead = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  contracts: TContracts,
): TContracts[0] => contracts.at(0) as TContracts[0];

export const chainTail = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  contracts: TContracts,
): TContracts extends readonly [unknown, ...infer Rest] ? Rest : readonly [] => contracts.slice(1) as never;

export type {
  StrategyContext,
  StrategyMode,
  StrategyLane,
  StrategyTuple,
  StrategyTupleHead,
  StrategyTupleTail,
  StrategyPlan,
  StrategyStep,
  StrategyResult,
  SignalEvent,
  SessionRoute,
  WorkspaceId,
  SessionId,
  RunId,
  PlanId,
  ScenarioId,
  PluginId,
  PluginFingerprint,
  StrategyPhase,
} from './types';
