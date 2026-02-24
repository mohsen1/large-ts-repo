import type { Brand } from '@shared/type-level';
import type { OrchestrationLab, OrchestrationLabId, LabPlan, PlanScore, LabRunId, LabSignal, LabStep } from './types';
import type { PluginExecutionEvent, PluginResultStatus, PluginStage, PluginExecutionTrace } from './plugin-registry';

export type LabTraceId = Brand<string, 'LabTraceId'>;
export type LabPolicyTag = Brand<string, 'LabPolicyTag'>;
export type LabMetricName = 'score' | 'risk' | 'latency' | 'throughput' | 'resilience';

export interface LabMetricEvent {
  readonly id: LabTraceId;
  readonly labId: OrchestrationLabId;
  readonly name: LabMetricName;
  readonly value: number;
  readonly at: string;
}

export interface LabRunEnvelope {
  readonly runId: LabRunId;
  readonly labId: OrchestrationLabId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly exitCode: number;
  readonly trace: readonly LabMetricEvent[];
}

export interface PlanRuntimeTrace {
  readonly plan: LabPlan;
  readonly policyTag: LabPolicyTag;
  readonly status: 'queued' | 'running' | 'succeeded' | 'halted' | 'errored';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly pluginTraces: readonly PluginExecutionTrace[];
  readonly metrics: readonly LabMetricEvent[];
}

export interface PluginTraceEnvelope {
  readonly runId: LabRunId;
  readonly phase: PluginStage;
  readonly plugin: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: PluginResultStatus;
}

export interface RunOutcome {
  readonly traceId: LabTraceId;
  readonly runId: LabRunId;
  readonly lab: OrchestrationLab;
  readonly selectedPlan?: LabPlan;
  readonly score: PlanScore;
  readonly steps: readonly LabStep[];
  readonly confidence: number;
  readonly runtime: PlanRuntimeTrace;
  readonly diagnostics: Record<string, string>;
}

export interface SignalEnvelope {
  readonly labId: OrchestrationLabId;
  readonly signal: LabSignal;
  readonly weight: number;
  readonly normalized: number;
}

export interface RuntimeIntent<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly createdAt: string;
}

export type MaybeMetric<T> = T | undefined;

export type MetricKey<T> = T extends 'score' ? 'SCORE' : T extends 'risk' ? 'RISK' : T extends 'latency' ? 'LATENCY' : T;
export type MetricRecord<T extends readonly LabMetricName[]> = {
  [K in T[number]]: {
    readonly latest: number;
    readonly trend: readonly number[];
  };
};

export type BrandedStatus<T extends string> = Brand<T, 'LabMetricStatus'>;

export type TraceResult<TPayload = unknown> = Readonly<{
  readonly status: BrandedStatus<'pass' | 'warn' | 'fail'>;
  readonly payload: TPayload;
  readonly pluginEvents: readonly PluginExecutionEvent<PlanRuntimeTrace, OrchestrationLab>[];
  readonly timestamp: string;
}>;

export interface ContractEnvelope<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly traceId: LabTraceId;
  readonly pluginTrace: readonly PluginTraceEnvelope[];
}

export interface ContractCheck {
  readonly contract: string;
  readonly version: `${number}.${number}.${number}`;
  readonly active: boolean;
  readonly evaluate: <TInput, TOutput>(
    input: RuntimeIntent<TInput>,
    output: TOutput,
  ) => Promise<TraceResult<TOutput>>;
}

export type ContractCatalog<T extends readonly ContractCheck[]> = {
  readonly id: string;
  readonly checks: T;
  readonly execute: () => Promise<{
    readonly results: {
      [P in T[number] as P['contract']]: TraceResult<P>;
    };
  }>;
};

export interface MetricAccumulator {
  readonly values: Map<LabMetricName, number[]>;
  readonly labels: Map<LabMetricName, string[]>;
}

export const makeTraceId = (value: string): LabTraceId => value as LabTraceId;
export const makePolicyTag = (value: string): LabPolicyTag => value as LabPolicyTag;

export const createMetricEvent = (
  lab: OrchestrationLab,
  name: LabMetricName,
  value: number,
): LabMetricEvent => ({
  id: `${lab.id}:${name}:${Date.now()}` as LabTraceId,
  labId: lab.id,
  name,
  value,
  at: new Date().toISOString(),
});

export const buildPolicyTag = (name: string, index: number): LabPolicyTag =>
  makePolicyTag(`${name}::${index}` as string);

export const buildRuntimeTrace = (
  plan: LabPlan,
  tag: LabPolicyTag,
): PlanRuntimeTrace => ({
  plan,
  policyTag: tag,
  status: 'queued',
  startedAt: new Date().toISOString(),
  pluginTraces: [],
  metrics: [],
});

export const attachMetricEvent = (
  trace: PlanRuntimeTrace,
  event: LabMetricEvent,
): PlanRuntimeTrace => ({
  ...trace,
  metrics: [...trace.metrics, event].toSorted((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()),
});

export const buildSignalEnvelope = (lab: OrchestrationLab, signal: LabSignal, weight: number): SignalEnvelope => {
  const normalized = Math.max(0, Math.min(1, signal.score / 100));
  return {
    labId: lab.id,
    signal,
    weight,
    normalized,
  };
};

export const aggregateSignalEnvelope = (signals: readonly SignalEnvelope[]): number =>
  signals.length === 0 ? 0 : signals.reduce((acc, entry) => acc + entry.weight * entry.normalized, 0);

export const normalizeMetricRecord = <T extends readonly LabMetricName[]>(keys: T): MetricRecord<T> => {
  const entries = keys.reduce<Record<string, { latest: number; trend: readonly number[] }>>((acc, key) => {
    acc[key] = {
      latest: 0,
      trend: [],
    };
    return acc;
  }, {});
  return entries as MetricRecord<T>;
};

export const computeConfidence = (score: PlanScore): number => {
  const safeRisk = Number.isFinite(score.controlImpact) ? score.controlImpact : 0;
  const weighted = (score.readiness * 0.4) + (score.resilience * 0.3) + (score.complexity * 0.2) + ((1 - safeRisk) * 0.1);
  return Number(Math.max(0, Math.min(1, weighted)).toFixed(3));
};
