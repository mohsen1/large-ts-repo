import type { Brand } from '@shared/type-level';
import type {
  LabCommandId,
  LabGraphNodeId,
  LabRunId,
  LabSignalId,
  LabWavePhase,
  LabWaveId,
  MetricPath,
  PhaseTag,
  TenantNamespace,
  WorkspaceNamespace,
} from './identifiers';

export type LabSignalKind = 'telemetry' | 'policy' | 'risk' | 'constraint' | 'readiness';
export type LabCommandKind = 'start' | 'pause' | 'resume' | 'cancel' | 'verify' | 'simulate';
export type LabEventKind = 'snapshot' | 'delta' | 'forecast' | 'alert' | 'action';
export type LabHealthState = 'queued' | 'running' | 'degraded' | 'blocked' | 'completed' | 'failed';
export type LabReadinessWindow = readonly [from: string, to: string];

export type Branded<T extends string, Tag extends string> = Brand<T, Tag>;

export type LabPhaseRoute<TPhase extends LabWavePhase> = `phase:${TPhase}`;
export type LabMetricRoute<TMetric extends string> = `metric:${TMetric}`;

export type LabScope<T extends string> = `lab:${T}`;
export type LabWindowLabel = `window:${string}`;
export type LabNodeLabel = `node:${string}`;
export type LabCommandLabel = `command:${string}`;

export interface LabActor {
  readonly actorId: string;
  readonly name: string;
  readonly teams: readonly string[];
}

export interface LabMetricPoint {
  readonly path: MetricPath;
  readonly value: number;
  readonly unit: string;
  readonly source: string;
  readonly createdAt: string;
}

export interface LabSignal<TPayload = unknown> {
  readonly id: LabSignalId;
  readonly runId: LabRunId;
  readonly kind: LabSignalKind;
  readonly phase: LabWavePhase;
  readonly severity: 0 | 1 | 2 | 3 | 4 | 5;
  readonly score: number;
  readonly source: string;
  readonly tags: readonly string[];
  readonly payload: TPayload;
  readonly metricPath: MetricPath;
  readonly observedAt: string;
}

export interface LabCommand {
  readonly id: LabCommandId;
  readonly runId: LabRunId;
  readonly kind: LabCommandKind;
  readonly phase: LabWavePhase;
  readonly targetNode: LabGraphNodeId;
  readonly rationale: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly scheduledAt: string;
}

export interface LabWave {
  readonly waveId: LabWaveId;
  readonly id: LabWaveId;
  readonly index: number;
  readonly runId: LabRunId;
  readonly phase: LabWavePhase;
  readonly window: LabReadinessWindow;
  readonly commandIds: readonly LabCommandId[];
  readonly constraints: readonly string[];
  readonly expectedDurationMs: number;
  readonly actualDurationMs?: number;
}

export interface LabRunContext {
  readonly runId: LabRunId;
  readonly tenantId: TenantNamespace;
  readonly workspaceId: WorkspaceNamespace;
  readonly owner: string;
  readonly environment: 'production' | 'staging' | 'simulation' | 'chaos-lab';
  readonly health: LabHealthState;
  readonly startedAt: string;
  readonly endedAt?: string;
}

export interface LabPlan<TSignal, TCommand> {
  readonly runId: LabRunId;
  readonly createdAt: string;
  readonly waves: readonly LabWave[];
  readonly signals: readonly LabSignal<TSignal>[];
  readonly commands: readonly TCommand[];
}

export interface LabRunMetrics {
  readonly runId: LabRunId;
  readonly totalSignals: number;
  readonly criticalSignals: number;
  readonly commandCount: number;
  readonly medianSignalLatencyMs: number;
  readonly riskDelta: number;
  readonly confidence: number;
  readonly telemetry: readonly LabMetricPoint[];
}

export interface LabRunSummary {
  readonly runId: LabRunId;
  readonly phase: LabWavePhase;
  readonly health: LabHealthState;
  readonly warnings: readonly string[];
  readonly metrics: LabRunMetrics;
  readonly policy: readonly LabPolicyClause[];
}

export interface LabPolicyClause {
  readonly code: string;
  readonly description: string;
  readonly active: boolean;
}

export interface LabPolicyEnvelope {
  readonly runId: LabRunId;
  readonly policyId?: Brand<string, 'LabPolicyId'>;
  readonly clauses?: readonly LabPolicyClause[];
  readonly id?: string;
  readonly maxConcurrency?: number;
  readonly allowPause?: boolean;
  readonly allowWarnings?: boolean;
  readonly pluginIds?: readonly string[];
  readonly phaseGating?: Partial<Record<LabWavePhase, boolean>>;
}

export interface LabEnvelope<TKind extends LabEventKind, TPayload = unknown> {
  readonly kind: TKind;
  readonly runId: LabRunId;
  readonly emittedAt: string;
  readonly phase: LabWavePhase;
  readonly payload: TPayload;
}

export interface LabPluginEvent<TInput = unknown, TOutput = unknown> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly trace: readonly string[];
}

export type LabReadonlyArray<T> = readonly T[];

export type MapEvents<T extends readonly LabEnvelope<LabEventKind, unknown>[]> = {
  [K in T[number] as K['kind']]: K['payload'];
};

export type SignalIndex<T extends LabWavePhase> = Extract<LabSignal, { readonly phase: T }>;

export type CommandByKind<TKind extends LabCommandKind> = Extract<LabCommand, { readonly kind: TKind }>;

export type MetricMap<T extends Record<string, number>> = {
  [K in keyof T as `metric:${K & string}`]: T[K];
};

export type PhaseMetadata<TPhase extends LabWavePhase> = {
  readonly phase: TPhase;
  readonly tag: PhaseTag;
  readonly enabled: boolean;
  readonly route: `route:${LabPhaseRoute<TPhase>}`;
};

export type RuntimeHints<T extends readonly string[]> = {
  readonly hints: T;
  readonly map: {
    [K in T[number] as `hint:${K}`]: K;
  };
};

export type { LabWavePhase, LabCommandId, LabGraphNodeId, LabRunId, LabSignalId };

export interface RawLabPlanInput {
  readonly runId: string;
  readonly waves: readonly {
    readonly index: number;
    readonly windowMinutes: number;
    readonly commandBudget: number;
  }[];
}

export interface RawLabMetricsInput {
  readonly runId: string;
  readonly sampleCount: number;
  readonly risk: number;
  readonly confidence: number;
}

export type LabPlanTuple<
  TValue extends readonly unknown[],
  Max extends number,
> = TValue['length'] extends Max
  ? TValue
  : TValue extends readonly [infer Head, ...infer Rest]
    ? LabPlanTuple<readonly [Head, ...Rest], Max>
    : readonly [unknown];

export const asLabWavePhase = <T extends LabWavePhase>(phase: T): LabWavePhase => phase;
export const asHealthState = <T extends LabHealthState>(state: T): LabHealthState => state;
export const asLabPhaseRoute = <T extends LabWavePhase>(phase: T): LabPhaseRoute<T> =>
  `phase:${phase}` as LabPhaseRoute<T>;
export const asLabWindowLabel = (runId: string, phase: LabWavePhase, index: number): LabWindowLabel =>
  `window:${runId}:${phase}:${index}` as LabWindowLabel;
