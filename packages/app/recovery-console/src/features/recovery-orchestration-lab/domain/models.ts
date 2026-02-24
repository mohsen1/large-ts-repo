export type Brand<TValue, TMarker extends string> = TValue & { readonly __brand: TMarker };

export type TenantId = Brand<string, 'TenantId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type RunPlanId = Brand<string, 'RunPlanId'>;
export type PluginRunId = Brand<string, 'PluginRunId'>;
export type SignalId = Brand<string, 'SignalId'>;

export const tenantId = (value: string): TenantId => value as TenantId;
export const incidentId = (value: string): IncidentId => value as IncidentId;
export const runPlanId = (value: string): RunPlanId => value as RunPlanId;
export const signalId = (value: string): SignalId => value as SignalId;

export type IncidentCriticality = 'critical' | 'high' | 'moderate' | 'low';
export type RecoveryState = 'queued' | 'warming' | 'active' | 'rollback' | 'resolved';
export type SignalChannel = 'telemetry' | 'scheduler' | 'manual' | 'agent';
export type PluginStatus = 'idle' | 'running' | 'success' | 'skipped' | 'degraded' | 'failed';

export type EventScope = `scope:${string}`;
export type SignalCategory = `${string}/${string}`;
export type EventType = `${SignalChannel}:${SignalCategory}`;

export interface TemporalWindow {
  readonly start: string;
  readonly end: string;
  readonly tz: string;
}

export interface RecoverySignal {
  readonly id: SignalId;
  readonly tenant: TenantId;
  readonly incident: IncidentId;
  readonly category: SignalCategory;
  readonly severity: IncidentCriticality;
  readonly channel: SignalChannel;
  readonly origin: string;
  readonly detail: {
    code: EventType;
    value: number;
    tags: readonly string[];
    metadata: Record<string, string | number | boolean>;
  };
}

export interface PluginInputEnvelope {
  readonly runId: RunPlanId;
  readonly tenant: TenantId;
  readonly incident: IncidentId;
  readonly signals: readonly RecoverySignal[];
  readonly priorState?: RecoveryState;
}

export interface PolicyDirective {
  readonly name: string;
  readonly weight: number;
  readonly conditions: readonly string[];
  readonly controls: readonly {
    service: string;
    action: string;
    priority: number;
  }[];
}

export interface PlanSnapshot {
  readonly planId: RunPlanId;
  readonly tenant: TenantId;
  readonly incident: IncidentId;
  readonly horizon: TemporalWindow;
  readonly directives: readonly PolicyDirective[];
  readonly status: RecoveryState;
}

export interface RunStep {
  readonly plugin: string;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly status: PluginStatus;
  readonly details?: Record<string, unknown>;
}

export interface StepResult<T = unknown> {
  readonly step: RunStep;
  readonly output: T;
}

export interface OrchestrationEnvelope<TOutput = unknown> {
  readonly runId: RunPlanId;
  readonly tenant: TenantId;
  readonly status: RecoveryState;
  readonly output: TOutput;
  readonly timeline: readonly RunStep[];
}

export interface RuntimeArtifact {
  readonly tenant: TenantId;
  readonly runId: RunPlanId;
  readonly createdAt: string;
  readonly checksums: Record<string, string>;
}

export type SignalBuckets = Record<IncidentCriticality, number>;

export interface SignalDigest {
  readonly incident: IncidentId;
  readonly totals: SignalBuckets;
  readonly signals: readonly RecoverySignal[];
  readonly emittedAt: string;
}

export type SignalBySeverity<TRecord extends Record<IncidentCriticality, RecoverySignal[]>> = {
  [Severity in keyof TRecord as `${Extract<Severity, string>}_bucket`]: TRecord[Severity];
};

export type RuntimeAliasMap<TMap extends Record<string, unknown>> = {
  [Alias in keyof TMap as `runtime:${Extract<Alias, string>}`]: TMap[Alias];
};

export type ExtractEventByCategory<TSignals extends readonly RecoverySignal[], TCategory extends SignalCategory> = {
  [Index in keyof TSignals]: TSignals[Index] extends { readonly category: TCategory } ? TSignals[Index] : never;
}[number];

export interface RecoveryMetrics {
  readonly reliability: number;
  readonly throughput: number;
  readonly confidence: number;
}

export interface OrchestrationPlanInput extends PluginInputEnvelope {
  readonly title: string;
  readonly requestedAt: string;
  readonly window: TemporalWindow;
  readonly metrics: RecoveryMetrics;
}

export interface OrchestrationPlanOutput {
  readonly runId: RunPlanId;
  readonly directives: readonly PolicyDirective[];
  readonly artifacts: readonly RuntimeArtifact[];
  readonly summary: string;
}

export interface OrchestratedRun {
  readonly plan: OrchestrationPlanInput;
  readonly snapshot: OrchestrationEnvelope<OrchestrationPlanOutput>;
}

export const emptyWindow = (base = new Date()): TemporalWindow => ({
  start: base.toISOString(),
  end: new Date(base.getTime() + 2.4 * 60 * 60 * 1000).toISOString(),
  tz: 'UTC',
});

export const signalById = (signals: readonly RecoverySignal[], search: SignalId): RecoverySignal | undefined =>
  signals.find((entry) => entry.id === search);

export const aggregateSignalTotals = (signals: readonly RecoverySignal[]): SignalBuckets => {
  const totals: SignalBuckets = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const signal of signals) {
    totals[signal.severity] = totals[signal.severity] + 1;
  }
  return totals;
};

export const severityOrder: readonly IncidentCriticality[] = ['critical', 'high', 'moderate', 'low'];
