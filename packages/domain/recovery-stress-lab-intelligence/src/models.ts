import { Brand, Graph, NodeId, normalizeLimit, withBrand } from '@shared/core';

export type Brandify<T, TBrand extends string> = Brand<T, TBrand>;

export type TenantId = Brandify<string, 'TenantId'>;
export type StressPlanId = Brandify<string, 'StressPlanId'>;
export type StressLabPluginId = Brandify<string, 'StressLabPluginId'>;
export type ForecastWindowId = Brandify<string, 'ForecastWindowId'>;
export type StageAttemptId = Brandify<string, 'StageAttemptId'>;
export type SignalEnvelopeId = Brandify<string, 'RecoverySignalId'>;
export type StageSignalId = SignalEnvelopeId;
export type CommandRunbookId = Brandify<string, 'CommandRunbookId'>;
export type RecoverySignalId = SignalEnvelopeId;
export type CommandStepId = Brandify<string, 'CommandStepId'>;
export type WorkloadTopologyNodeId = Brandify<string, 'NodeId'>;
export type WorkloadId = WorkloadTopologyNodeId;

export type StressPhase =
  | 'observe'
  | 'isolate'
  | 'migrate'
  | 'restore'
  | 'verify'
  | 'standdown'
  | 'diagnose'
  | 'ingest'
  | 'simulate'
  | 'score'
  | 'recommend';

export type StageClass = 'raw' | 'derived' | 'prediction' | 'decision';
export type SeverityBand = 'low' | 'medium' | 'high' | 'critical';
export type SignalClass = 'availability' | 'integrity' | 'performance' | 'compliance';

export interface RecoverySignal {
  readonly id: RecoverySignalId;
  readonly class: SignalClass;
  readonly severity: SeverityBand;
  readonly title: string;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CommandStep {
  readonly commandId: CommandStepId;
  readonly title: string;
  readonly phase: StressPhase;
  readonly estimatedMinutes: number;
  readonly prerequisites: readonly CommandStepId[];
  readonly requiredSignals: readonly RecoverySignalId[];
}

export interface CommandRunbook {
  readonly id: CommandRunbookId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly CommandStep[];
  readonly ownerTeam: string;
  readonly cadence: Readonly<{ weekday: number; windowStartMinute: number; windowEndMinute: number }>;
}

export interface ReadinessWindow {
  readonly runbookId: CommandRunbookId;
  readonly startAt: string;
  readonly endAt: string;
  readonly phaseOrder: readonly StressPhase[];
}

export interface RecoverySimulationResult {
  readonly tenantId: TenantId;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly selectedRunbooks: readonly CommandRunbookId[];
  readonly ticks: readonly SimulationTick[];
  readonly riskScore: number;
  readonly slaCompliance: number;
  readonly notes: readonly string[];
}

export interface SimulationTick {
  readonly timestamp: string;
  readonly activeWorkloads: number;
  readonly blockedWorkloads: readonly WorkloadTopologyNodeId[];
  readonly confidence: number;
}

export interface OrchestrationPlan {
  readonly tenantId: TenantId;
  readonly scenarioName: string;
  readonly schedule: readonly ReadinessWindow[];
  readonly runbooks: readonly CommandRunbook[];
  readonly dependencies: Graph<NodeId, { readonly fromCriticality: number; readonly toCriticality: number }>;
  readonly estimatedCompletionMinutes: number;
}

export interface WorkloadTopologyNode {
  readonly id: WorkloadTopologyNodeId;
  readonly name: string;
  readonly ownerTeam: string;
  readonly criticality: 1 | 2 | 3 | 4 | 5;
  readonly active: boolean;
}

export interface WorkloadTopologyEdge {
  readonly from: WorkloadTopologyNodeId;
  readonly to: WorkloadTopologyNodeId;
  readonly coupling: number;
  readonly reason: string;
}

export interface WorkloadTopology {
  readonly tenantId: TenantId;
  readonly nodes: readonly WorkloadTopologyNode[];
  readonly edges: readonly WorkloadTopologyEdge[];
}

export interface ForecastSummary {
  readonly tenantId: TenantId;
  readonly total: number;
  readonly average: number;
  readonly min: number;
  readonly max: number;
  readonly points: readonly { readonly index: number; readonly signalId: SignalEnvelopeId; readonly forecast: number; readonly confidence: number; readonly severity: SeverityBand; readonly windowId: ForecastWindowId }[];
}

export interface StageSignal {
  readonly signal: SignalEnvelopeId;
  readonly tenantId: TenantId;
  readonly signalClass: SignalClass;
  readonly severity: SeverityBand;
  readonly score: number;
  readonly createdAt: number;
  readonly source: string;
}

export interface ForecastWindow {
  readonly id: ForecastWindowId;
  readonly tenantId: TenantId;
  readonly phase: StressPhase;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly signalIds: readonly SignalEnvelopeId[];
  readonly jitterSeed: number;
}

export interface Recommendation {
  readonly code: Brandify<string, 'RecommendationCode'>;
  readonly severity: SeverityBand;
  readonly phase: StressPhase;
  readonly rationale: string;
  readonly affectedSignals: readonly SignalEnvelopeId[];
  readonly estimatedMitigationMinutes: number;
}

export type RecommendationCode = Brandify<string, 'RecommendationCode'>;

export interface StressPlanRun {
  readonly id: StressPlanId;
  readonly tenantId: TenantId;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly input: {
    readonly tenantId: TenantId;
    readonly phaseSequence: readonly StressPhase[];
    readonly windows: readonly ForecastWindow[];
    readonly signals: readonly StageSignal[];
    readonly maxConcurrency: number;
  };
  readonly status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  readonly confidence: number;
  readonly recommendations: readonly Recommendation[];
}

export interface PluginContextState {
  readonly tenantId: TenantId;
  readonly stageHistory: readonly StressPhase[];
  readonly route: string;
  readonly tags: readonly string[];
}

export interface PluginExecutionPlan {
  readonly pluginId: StressLabPluginId;
  readonly tenantId: TenantId;
  readonly phase: StressPhase;
  readonly runbook: readonly StressPhase[];
  readonly attempts: number;
  readonly allowedBypass: boolean;
}

export interface StageAttempt<TSignal extends StageSignal = StageSignal> {
  readonly id: StageAttemptId;
  readonly source: TSignal['signal'];
  readonly phaseClass: StageClass;
  readonly severityBand: TSignal['severity'];
  readonly normalizedScore: number;
}

export type StageEventName<TPrefix extends string, TKind extends string> = `${TPrefix}:${TKind}:${StressPhase}`;
export type StageEvent = StageEventName<'recovery', 'trace'>;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type StageAttemptSet<TSignals extends readonly StageSignal[]> = {
  readonly attempts: { readonly [Index in keyof TSignals]: StageAttempt<TSignals[Index]> };
  readonly map: {
    readonly [K in keyof TSignals as TSignals[K] extends StageSignal
      ? `attempt:${TSignals[K]['signal']}`
      : never]: TSignals[K];
  };
};

export type StageRoute<TPath extends string> = TPath extends `${infer Head}/${infer Rest}`
  ? readonly [Head, ...StageRoute<Rest>]
  : readonly [TPath];

export type StageRouteLength<TPath extends string> = StageRoute<TPath>['length'];

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends readonly unknown[]
    ? readonly [...FlattenTuple<Head>, ...FlattenTuple<Tail>]
    : readonly [Head, ...FlattenTuple<Tail>]
  : readonly [];

export type PrefixKeys<T extends Record<string, unknown>, Prefix extends string> = {
  [Key in keyof T as Key extends string ? `${Prefix}:${Key}` : never]: T[Key];
};

export const phaseOrder = ['observe', 'isolate', 'restore', 'migrate', 'simulate', 'score', 'recommend'] as const;

export const severityScale = {
  low: 0.15,
  medium: 0.42,
  high: 0.74,
  critical: 0.96,
} as const;

export const pluginClassifiers = {
  raw: ['observe', 'isolate'] as const,
  derived: ['diagnose'] as const,
  prediction: ['simulate', 'score'] as const,
  decision: ['recommend'] as const,
} as const;

export const normalizePhaseLimit = (value: number): number => normalizeLimit(Math.floor(value));

export const normalizeWeight = (value: number, band: SeverityBand): number => {
  const base = severityScale[band];
  return Math.max(0, Math.min(1, base * value));
};

export const createTenantId = (value: string): TenantId => withBrand(value, 'TenantId');
export const createSignalId = (value: string): RecoverySignalId => withBrand(value, 'RecoverySignalId');
export const createWindowId = (value: string): ForecastWindowId => withBrand(value, 'ForecastWindowId');
export const createPluginId = (value: string): StressLabPluginId => withBrand(value, 'StressLabPluginId');
export const createStageAttemptId = (value: string): StageAttemptId => withBrand(value, 'StageAttemptId');
export const createRecommendationCode = (value: string): RecommendationCode => withBrand(value, 'RecommendationCode');
export const createRunbookId = (value: string): CommandRunbookId => withBrand(value, 'CommandRunbookId');
export const createStepId = (value: string): CommandStepId => withBrand(value, 'CommandStepId');
export const createRunId = (tenantId: TenantId, suffix: string): StressPlanId => withBrand(`${tenantId}:${suffix}`, 'StressPlanId');

export type InputShape<T> = T extends PluginInvocation<infer TInput, any, any, any> ? TInput : never;
export type OutputShape<T> = T extends PluginInvocation<any, infer TOutput, any, any> ? TOutput : never;

export interface PluginInvocation<
  TInput,
  TOutput,
  TContext extends PluginContextState = PluginContextState,
  TKind extends string = string,
> {
  readonly id: StressLabPluginId;
  readonly tenantId: TenantId;
  readonly kind: TKind;
  readonly phase: StressPhase;
  readonly runbook: readonly StressPhase[];
  readonly input: TInput;
  readonly context: TContext;
  run: (input: NoInfer<TInput>, context: TContext) => Promise<PluginResult<TOutput>>;
}

export type PluginKindOf<TPlugin> = TPlugin extends PluginInvocation<any, any, any, infer TKind> ? TKind : never;

export type PluginResult<TOutput, TError extends Error = Error> =
  | ({ readonly ok: true; readonly value: TOutput } & { readonly generatedAt: string })
  | ({ readonly ok: false; readonly error: TError } & { readonly generatedAt: string });

export type PluginInvocationShape<TCatalog extends readonly PluginInvocation<any, any, any, any>[]> = {
  [K in TCatalog[number] as K['kind']]: TCatalog;
};

export interface PipelineFrame<TSignals extends readonly unknown[]> {
  readonly tenantId: TenantId;
  readonly payload: TSignals;
  readonly window: ForecastWindow;
  readonly events: Readonly<StageRoute<`${string}:${StressPhase}:${string}`>>;
  readonly routeDepth: StageRouteLength<`${string}:${StressPhase}:${string}`>;
  readonly attempts: StageAttemptSet<FlattenTuple<TSignals & readonly StageSignal[]>>;
}

export type StageSignalIndex<TSignals extends readonly StageSignal[]> = {
  readonly [Signal in TSignals[number] as Signal['signal']]: Signal;
};
