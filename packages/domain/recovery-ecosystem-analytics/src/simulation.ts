import { NoInfer } from '@shared/type-level';
import type { JsonValue } from '@shared/type-level';
import {
  type AnalyticsSession,
  type AnalyticsTenant,
  type SignalNamespace,
  asWindow,
  asSession,
} from './identifiers';
import type { AnalyticsSignalPayload, SignalByName } from './models';

export type ScenarioPath<TNodes extends readonly string[]> = {
  readonly path: {
    readonly [K in keyof TNodes]: `node:${string & TNodes[K]}`;
  };
};

type BuildTuple<TDepth extends number, TItems extends readonly unknown[] = []> = TItems['length'] extends TDepth
  ? TItems
  : BuildTuple<TDepth, [...TItems, unknown]>;

type DecrementDepth<TDepth extends number> = BuildTuple<TDepth> extends readonly [...infer TRest, unknown]
  ? TRest['length']
  : 0;

export type RecursiveTuple<TValue, TDepth extends number, TState extends unknown[] = []> = TState['length'] extends TDepth
  ? TState
  : RecursiveTuple<TValue, TDepth, [...TState, TValue]>;

export type ScenarioStageInput<TLabel extends string = string> = {
  readonly label: `stage:${TLabel}`;
  readonly weight: number;
  readonly signalTypes: readonly `signal:${string}`[];
};

export interface ScenarioDefinition<TName extends string = string> {
  readonly id: `scenario:${TName}`;
  readonly tenant: AnalyticsTenant;
  readonly window: ReturnType<typeof asWindow>;
  readonly session: AnalyticsSession;
  readonly stages: readonly ScenarioStageInput[];
  readonly tolerance: number;
}

export interface ScenarioMetrics {
  readonly score: number;
  readonly confidence: number;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly signals: readonly string[];
  readonly matrix: {
    readonly nodes: readonly string[];
    readonly edges: readonly [string, string][];
  };
}

export type ScenarioEvents<TInput> = {
  readonly startedAt: string;
  readonly runId: string;
  readonly input: TInput;
};

export const isSimulationSignal = (signal: unknown): signal is AnalyticsSignalPayload =>
  !!signal &&
  typeof signal === 'object' &&
  'kind' in signal &&
  typeof (signal as { kind?: unknown }).kind === 'string';

export const signalKindSet = <const TSignals extends readonly `signal:${string}`[]>(
  values: NoInfer<TSignals>,
): Readonly<{
  readonly values: TSignals;
  readonly keys: string[];
}> => ({
  values,
  keys: values.map((value) => value.replace('signal:', '')),
});

export const buildScenarioSignature = <const TStages extends readonly ScenarioStageInput[]>(
  scenarioId: string,
  stages: NoInfer<TStages>,
): string =>
  `${scenarioId}::${stages.length}::${stages.map((stage) => `${stage.label}:${stage.weight}`).join('||')}`;

export const summarizeSignalsByKind = <const TInput extends readonly AnalyticsSignalPayload[]>(
  entries: NoInfer<TInput>,
  tenant: string,
): SignalByName<readonly [string]> => {
  const grouped = new Map<string, { score: number; tags: readonly string[] }>();
  for (const entry of entries) {
    const key = entry.kind.replace('signal:', '');
    const current = grouped.get(key);
    const base = typeof entry.payload === 'number' ? entry.payload : 50;
    if (!current) {
      grouped.set(key, { score: Number(base), tags: [`tag:${key}`] });
    } else {
      grouped.set(key, {
        score: current.score + Number(base),
        tags: [...current.tags, `tag:${key}`],
      });
    }
  }

  const normalized = new Map<string, { observedAt: string; score: number; tags: readonly string[] }>();
  for (const [kind, aggregate] of grouped.entries()) {
    normalized.set(`signal:${kind}`, {
      observedAt: tenant,
      score: Number((aggregate.score / Math.max(aggregate.tags.length, 1)).toFixed(2)),
      tags: aggregate.tags,
    });
  }
  return Object.fromEntries(normalized) as SignalByName<readonly [string]>;
};

export const evaluateMetricPoints = (points: readonly { readonly value: number }[]): ScenarioMetrics => {
  const warnings = points.filter((point) => point.value > 70).length;
  const critical = points.filter((point) => point.value > 90).length;
  const score = Math.max(0, Math.min(100, points.reduce((acc, point) => acc + point.value, 0) / Math.max(points.length, 1)));
  return {
    score,
    confidence: 1 - warnings / Math.max(points.length, 1),
    warningCount: warnings,
    criticalCount: critical,
    signals: points.map((_, index) => `signal:${index}`),
    matrix: {
      nodes: points.map((_, index) => `node:${index}`),
      edges: points.length > 1
        ? points.slice(1).map((_, index) => [`node:${index}`, `node:${index + 1}`] as [string, string])
        : [],
    },
  };
};

export const resolveSessionWindow = (tenant: string): ReturnType<typeof asWindow> => asWindow(`${tenant}-${Date.now()}`);

export const createScenarioEnvelope = (tenant: string, count = 3): ScenarioDefinition => ({
  id: `scenario:${tenant}` as const,
  tenant: (`tenant:${tenant}` as AnalyticsTenant),
  window: asWindow(`session-${tenant}`),
  session: asSession(`scenario-${tenant}`),
  stages: Array.from({ length: count }, (_, index) => ({
    label: `stage:${index}` as const,
    weight: (index + 1) * 10,
    signalTypes: [`signal:heartbeat`, `signal:policy-${index}`] as const,
  })),
  tolerance: 0.8,
});

export const isSession = (value: string): value is AnalyticsSession =>
  value.startsWith('session:');

export const scenarioPathWeights = <const TSignalWeights extends readonly number[]>(
  values: NoInfer<TSignalWeights>,
): readonly [string, ...number[]] => {
  const output = ['seed', ...values];
  return output as unknown as readonly [string, ...number[]];
};

export const asSignalNamespace = (namespace: string): SignalNamespace =>
  `namespace:${namespace}` as SignalNamespace;

export const resolveSignalNamespace = (value: SignalNamespace): string => value.replace('namespace:', '');
