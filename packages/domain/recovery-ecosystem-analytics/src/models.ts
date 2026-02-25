import { asWindow, type AnalyticsRun, type AnalyticsTenant, type SignalNamespace, type AnalyticsWindow } from './identifiers';
import type { JsonObject, JsonValue, NoInfer } from '@shared/type-level';
import type { PipelineStep } from './pipeline';

export type AnalyticsSeverity = 'low' | 'medium' | 'high' | 'critical';
export type MetricUnit = 'ms' | 'pct' | 'count' | 'ratio';
export type SignalCategory = 'core' | 'policy' | 'telemetry' | 'timeline' | 'forecast';
export type AnalyticsKey = `analytics:${string}`;
export type SignalAlias<T extends string = string> = `alias:${T}`;
export type SignalFingerprint<T extends string = string> = `fingerprint:${T}`;
export type ScenarioSignal = `signal:${string}`;

export type MetricPoint<TUnit extends MetricUnit = MetricUnit> = Readonly<{
  readonly unit: TUnit;
  readonly value: number;
  readonly at: string;
  readonly labels: Readonly<Record<string, string>>;
}>;

export type MetricTable<TPoints extends readonly MetricPoint[]> = {
  [K in TPoints[number] as K['unit']]: readonly K[];
};

export interface AnalyticsMetricRecord<TName extends string = string> {
  readonly id: `metric:${TName}`;
  readonly name: TName;
  readonly unit: MetricUnit;
  readonly score: number;
  readonly tags: readonly string[];
}

export type AnalyticsSignalPayload<TKind extends string = string, TPayload = JsonValue> = Readonly<{
  readonly kind: `signal:${TKind}`;
  readonly runId: AnalyticsRun;
  readonly namespace: SignalNamespace;
  readonly at: string;
  readonly payload: TPayload;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}>;

export interface AnalyticsSignalState<
  TKind extends string = string,
  TPayload extends JsonValue = JsonValue,
> {
  readonly key: SignalKey<TKind>;
  readonly phase: `phase:${TKind}`;
  readonly payload: TPayload;
  readonly score: number;
  readonly severity: AnalyticsSeverity;
  readonly active: boolean;
}

export type SignalKey<TKind extends string = string> = `signal:${TKind}`;

export interface AnalyticsPlanRecord<
  TId extends string = string,
  TSteps extends readonly PipelineStep[] = readonly PipelineStep[],
> {
  readonly planId: `plan:${TId}`;
  readonly tenant: `tenant:${string}`;
  readonly namespace: SignalNamespace;
  readonly phases: StepPhase<TSteps>;
  readonly steps: TSteps;
  readonly window: AnalyticsWindow;
}

export type StepPhase<TSteps extends readonly PipelineStep[]> = {
  readonly [K in keyof TSteps as K extends `${number}` ? `phase:${K}` : never]: TSteps[K] extends PipelineStep<
    infer TName,
    infer TInput,
    infer TOutput
  >
    ? {
        readonly name: TName;
        readonly state: `state:${TName}`;
        readonly input: NoInfer<TInput>;
        readonly output: NoInfer<TOutput>;
      }
    : never;
};

export type ScenarioStage = Readonly<{
  readonly id: `stage:${string}`;
  readonly name: string;
  readonly window: AnalyticsWindow;
  readonly index: number;
  readonly summary: AnalyticsSignalSummary;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}>;

type BuildTuple<TDepth extends number, TItems extends readonly unknown[] = []> = TItems['length'] extends TDepth
  ? TItems
  : BuildTuple<TDepth, [...TItems, unknown]>;

export type StageTuple<TDepth extends number> = TDepth extends 0
  ? readonly []
  : readonly [
      ScenarioStage,
      ...StageTuple<BuildTuple<TDepth> extends readonly [...infer TRest, unknown] ? TRest['length'] : 0>,
    ];

export interface ScenarioManifest<TName extends string = string> {
  readonly id: `scenario:${TName}`;
  readonly stages: readonly ScenarioStage[];
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export type ScenarioFingerprint<TManifest extends ScenarioManifest> = TManifest extends {
  readonly id: infer TId extends string;
}
  ? `${TId}::v1`
  : never;

export type SignalByName<TSignals extends readonly string[]> = {
  [K in TSignals[number] as K extends `signal:${string}` ? K : `signal:${K}`]: {
    readonly observedAt: string;
    readonly score: number;
    readonly tags: readonly `tag:${K}`[];
  };
};

export interface AnalyticsSignalSummary {
  readonly signalCount: number;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly score: number;
}

export const asSignalAlias = <TName extends string>(name: TName): SignalAlias<TName> =>
  `alias:${name}`;

export const createMetricWindow = (tenant: string, namespace: string): AnalyticsWindow =>
  asWindow(`${tenant}-${namespace}`);

export const summarizeSignalState = <const TPayload extends AnalyticsSignalPayload>(
  signal: TPayload,
  score: number,
): Readonly<{
  readonly key: SignalKey<TPayload['kind']>;
  readonly phase: `phase:${TPayload['kind']}`;
  readonly score: number;
  readonly severity: AnalyticsSeverity;
  readonly active: true;
}> => ({
  key: `signal:${signal.kind.replace('signal:', '')}` as SignalKey<TPayload['kind']>,
  phase: `phase:${signal.kind}`,
  score,
  severity: score >= 90 ? 'low' : score >= 75 ? 'medium' : score >= 50 ? 'high' : 'critical',
  active: true,
});

export const toMetricPoint = (value: number, unit: MetricUnit, at = new Date().toISOString()): MetricPoint => ({
  unit,
  value,
  at,
  labels: { source: 'recovery-ecosystem-analytics' },
});

export const withDefaultPlanWindow = (tenant = 'tenant:default', namespace = 'namespace:default'): AnalyticsWindow =>
  createMetricWindow(tenant, namespace);

export const foldMetricPoints = (points: readonly MetricPoint[]): Readonly<Record<MetricUnit, number>> => {
  const out = Object.fromEntries(
    (['ms', 'pct', 'count', 'ratio'] as MetricUnit[]).map((unit) => [unit, 0]),
  ) as Record<MetricUnit, number>;
  for (const point of points) {
    out[point.unit] = (out[point.unit] ?? 0) + point.value;
  }
  return out;
};

export const createAnalyticsSummary = (
  signals: readonly AnalyticsSignalSummary[],
): AnalyticsSignalSummary =>
  signals.reduce(
    (acc, signal) => ({
      signalCount: acc.signalCount + 1,
      warningCount: acc.warningCount + signal.warningCount,
      criticalCount: acc.criticalCount + signal.criticalCount,
      score: acc.score + Math.max(0, 100 - signal.score),
    }),
    { signalCount: 0, warningCount: 0, criticalCount: 0, score: 0 },
  );

export const withWindowSuffix = (window: AnalyticsWindow, suffix: string): AnalyticsWindow =>
  asWindow(`${window}-${sanitizeWindowSuffix(suffix)}` as string);

const sanitizeWindowSuffix = (value: string): string =>
  value.replace(/[^a-z0-9._-]/gi, '-').replace(/(^-+|-+$)/g, '');

export const buildScenarioFingerprint = (signals: readonly string[]): readonly SignalFingerprint<string>[] =>
  signals.map((signal) => `fingerprint:${signal}` as SignalFingerprint<string>).toSorted();
