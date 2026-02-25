import type {
  CascadeBlueprint,
  CascadePolicyRun,
  MetricObservation,
  StageName,
} from '@domain/recovery-cascade-intelligence';
import { normalizeStageWeights } from './telemetry.js';

export type InsightKey = `insight:${string}`;

export interface RuntimeInsight {
  readonly key: InsightKey;
  readonly score: number;
  readonly tags: readonly string[];
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number>>;
}

export interface RunInsights<TBlueprint extends CascadeBlueprint> {
  readonly runId: CascadePolicyRun<TBlueprint>['runId'];
  readonly blueprint: CascadePolicyRun<TBlueprint>['blueprint'];
  readonly envelope: SummaryEnvelope;
  readonly insights: readonly RuntimeInsight[];
  readonly risk: number;
}

export interface SummaryEnvelope {
  readonly run: string;
  readonly namespace: string;
  readonly score: number;
  readonly createdAt: string;
}

export interface SignalCatalogEntry {
  readonly name: InsightKey;
  readonly weight: number;
  readonly threshold: number;
}

const SIGNAL_CATALOG = [
  { name: 'insight:latency' as InsightKey, weight: 0.4, threshold: 250 },
  { name: 'insight:coverage' as InsightKey, weight: 0.4, threshold: 70 },
  { name: 'insight:failure' as InsightKey, weight: 0.2, threshold: 5 },
] as const satisfies readonly SignalCatalogEntry[];

const metricToInsight = (metric: MetricObservation): RuntimeInsight => {
  const weight = Math.max(1, Math.min(10, metric.value / 10));
  const score = Math.max(0, 1 - metric.value / 100);
  return {
    key: `insight:${metric.name}` as InsightKey,
    score: Number(score.toFixed(5)),
    tags: [metric.unit, `weight:${weight}`],
    message: `${metric.name} @ ${metric.measuredAt}`,
    details: {
      value: metric.value,
      observedAt: metric.measuredAt,
    },
  };
};

const chooseSignalByName = (name: string): SignalCatalogEntry =>
  SIGNAL_CATALOG.find((entry) => name.includes(entry.name.replace('insight:', '')))
  ?? SIGNAL_CATALOG[0];

const inferStageTimeline = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): Readonly<Record<StageName, number>> => {
  const weights = normalizeStageWeights(run.blueprint.stages);
  return Object.fromEntries(
    run.blueprint.stages.map((stage) => [stage.name, Number(weights[String(stage.name)] ?? 1)]),
  ) as Readonly<Record<StageName, number>>;
};

const withRiskBand = (score: number): 'high' | 'medium' | 'low' => {
  if (score > 0.8) return 'low';
  if (score > 0.5) return 'medium';
  return 'high';
};

export const makeSummaryEnvelope = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): SummaryEnvelope => {
  const values = run.metrics.map((metric) => metric.value);
  const average = values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
  return {
    run: run.runId,
    namespace: run.blueprint.namespace,
    score: average,
    createdAt: run.startedAt,
  };
};

export const buildRunInsights = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): RunInsights<TBlueprint> => {
  const envelope = makeSummaryEnvelope(run);
  const sorted = run.metrics
    .map(metricToInsight)
    .map((entry) => ({
      ...entry,
      message: `${entry.message} (${chooseSignalByName(entry.key).name})`,
    }))
    .toSorted((left, right) => right.score - left.score);

  const risk = Number((1 - sorted.reduce((sum, entry) => sum + entry.score, 0) / Math.max(1, sorted.length)).toFixed(4));
  void withRiskBand(risk);
  void inferStageTimeline(run);

  return {
    runId: run.runId,
    blueprint: run.blueprint,
    envelope,
    insights: sorted,
    risk,
  };
};

export const summarizeRisks = <TBlueprint extends CascadeBlueprint>(
  runs: readonly { readonly run: CascadePolicyRun<TBlueprint> }[],
) => {
  const risks = runs.map((entry) => Number(entry.run.risk.score.toFixed(4)));
  const max = risks.length === 0 ? 0 : Math.max(...risks);
  const min = risks.length === 0 ? 0 : Math.min(...risks);
  const avg = risks.length === 0 ? 0 : risks.reduce((acc, value) => acc + value, 0) / risks.length;
  return {
    max,
    min,
    avg,
    count: risks.length,
  };
};

export const classifyRun = (run: CascadePolicyRun): string => {
  const severity = withRiskBand(1 - run.risk.score);
  return `run:${run.runId}:class:${severity}`;
};

export const dedupeByMessage = (insights: readonly RuntimeInsight[]) => {
  const byMessage = new Map<string, RuntimeInsight>();
  for (const entry of insights) {
    byMessage.set(entry.message, entry);
  }
  return [...byMessage.values()];
};

export const scoreByCatalog = (insights: readonly RuntimeInsight[]) => {
  let score = 0;
  for (const entry of insights) {
    const catalog = chooseSignalByName(entry.key);
    score += entry.score * catalog.weight;
  }
  return Number(score.toFixed(4));
};

export const summarizeByTag = (insights: readonly RuntimeInsight[]): Readonly<Record<string, number>> => {
  const output: Record<string, number> = {};
  for (const insight of insights) {
    for (const tag of insight.tags) {
      output[tag] = (output[tag] ?? 0) + insight.score;
    }
  }
  return output;
};

export const toHealthScore = (score: number): 'critical' | 'warn' | 'ok' =>
  score >= 0.75 ? 'ok' : score >= 0.35 ? 'warn' : 'critical';
