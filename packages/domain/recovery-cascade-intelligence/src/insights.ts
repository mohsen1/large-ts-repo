import type {
  CascadeBlueprint,
  CascadePolicyRun,
  MetricObservation,
  RiskBand,
  RiskEnvelope,
  StageName,
  StageNameFromManifest,
} from './types.js';
import { withRiskEnvelope } from './types.js';

export type InsightVectorKind = 'throughput' | 'stability' | 'latency' | 'cost';

export interface InsightPoint {
  readonly kind: InsightVectorKind;
  readonly stage: StageName;
  readonly score: number;
  readonly message: string;
  readonly severity: 'good' | 'warn' | 'critical';
}

export interface InsightSummary<TBlueprint extends CascadeBlueprint> {
  readonly runId: CascadePolicyRun<TBlueprint>['runId'];
  readonly namespace: TBlueprint['namespace'];
  readonly vectors: readonly InsightPoint[];
  readonly aggregateScore: number;
  readonly aggregateBand: RiskBand;
  readonly recommendedActions: readonly string[];
}

export interface InsightEnvelope<TBlueprint extends CascadeBlueprint> {
  readonly run: CascadePolicyRun<TBlueprint>;
  readonly snapshotAt: string;
  readonly stageCoverage: Readonly<Record<StageNameFromManifest<TBlueprint>, number>>;
  readonly risk: RiskEnvelope;
  readonly vectors: readonly InsightPoint[];
  readonly health: 'good' | 'warning' | 'critical';
}

const stageFromMetric = (metric: MetricObservation): StageName => {
  const [head] = metric.name.split('.');
  if (head === '') {
    return 'stage.unknown' as StageName;
  }
  return head === 'stage' ? (metric.name as StageName) : (`stage.${head}` as StageName);
};

const metricToPoint = (metric: MetricObservation): InsightPoint => {
  const kind: InsightVectorKind = metric.name.includes('throughput')
    ? 'throughput'
    : metric.name.includes('stability')
      ? 'stability'
      : metric.name.includes('latency')
        ? 'latency'
        : 'cost';

  const stage = stageFromMetric(metric);
  const rawScore = 1 - metric.value / 1_000;
  const score = Number(Math.max(0, Math.min(1, rawScore)).toFixed(5));
  const severity: 'good' | 'warn' | 'critical' =
    score > 0.75 ? 'good' : score > 0.35 ? 'warn' : 'critical';

  return {
    kind,
    stage,
    score,
    message: `${kind}/${stage} => ${metric.value} ${metric.unit}`,
    severity,
  };
};

const scoreRisk = (vectors: readonly InsightPoint[]): number => {
  if (vectors.length === 0) {
    return 0;
  }

  const aggregate = vectors.reduce((acc, point) => acc + point.score, 0) / vectors.length;
  return Number(aggregate.toFixed(5));
};

const severityFromScore = (score: number): RiskBand =>
  score >= 0.8 ? 'low' : score >= 0.5 ? 'medium' : score >= 0.25 ? 'high' : 'critical';

export const buildInsightPoints = <TBlueprint extends CascadeBlueprint>(
  run: CascadePolicyRun<TBlueprint>,
): readonly InsightPoint[] => {
  return run.metrics
    .map(metricToPoint)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 128);
};

export const buildSummary = <TBlueprint extends CascadeBlueprint>(
  run: CascadePolicyRun<TBlueprint>,
): InsightSummary<TBlueprint> => {
  const vectors = buildInsightPoints(run);
  const aggregateScore = scoreRisk(vectors);
  const actions = new Set<string>();

  for (const vector of vectors) {
    if (vector.severity === 'critical' || vector.severity === 'warn') {
      actions.add(`address_${vector.kind}`);
      actions.add(`inspect_${vector.stage.replace('.', '_')}`);
    }
  }

  return {
    runId: run.runId,
    namespace: run.blueprint.namespace,
    vectors,
    aggregateScore,
    aggregateBand: severityFromScore(1 - aggregateScore) as RiskBand,
    recommendedActions: [...actions],
  };
};

export const makeEnvelope = <TBlueprint extends CascadeBlueprint>(
  run: CascadePolicyRun<TBlueprint>,
  vectors: readonly InsightPoint[] = buildInsightPoints(run),
): InsightEnvelope<TBlueprint> => {
  const coverage: Partial<Record<StageNameFromManifest<TBlueprint>, number>> = {};
  for (const stage of run.blueprint.stages) {
    const count = run.metrics.filter((metric) => stage.name === stageFromMetric(metric)).length;
    coverage[stage.name as StageNameFromManifest<TBlueprint>] = count;
  }

  const aggregate = scoreRisk(vectors);
  const risk = withRiskEnvelope('intelligence', Number((1 - aggregate).toFixed(5)));
  return {
    run,
    snapshotAt: new Date().toISOString(),
    stageCoverage: coverage as Readonly<Record<StageNameFromManifest<TBlueprint>, number>>,
    risk: risk,
    vectors,
    health: aggregate > 0.75 ? 'good' : aggregate > 0.4 ? 'warning' : 'critical',
  };
};

export const enrichPolicyDraft = <
  TBlueprint extends CascadeBlueprint,
  const TTemplate extends Record<string, string>,
>(
  run: CascadePolicyRun<TBlueprint>,
  template: TTemplate,
) =>
  ({
    ...template,
    runId: String(run.runId),
    tenant: String(run.tenantId),
    namespace: run.blueprint.namespace,
    score: String(scoreRisk(buildInsightPoints(run))),
  }) as TTemplate & { runId: string; tenant: string; namespace: string; score: string };

export const makeSignal = <TBlueprint extends CascadeBlueprint>(run: CascadePolicyRun<TBlueprint>): string =>
  `${run.runId}:${run.status}:${run.startedAt}:${run.blueprint.namespace}:${run.blueprint.policyId}`;

export const toHealthScore = (score: number): 'ok' | 'warn' | 'critical' =>
  score >= 0.75 ? 'ok' : score >= 0.35 ? 'warn' : 'critical';

export const summarizeByKind = (points: readonly InsightPoint[]): Readonly<Record<InsightVectorKind, number>> => {
  const output: Record<InsightVectorKind, number> = {
    throughput: 0,
    stability: 0,
    latency: 0,
    cost: 0,
  };

  for (const point of points) {
    output[point.kind] += point.score;
  }

  return output;
};

export const filterInsightStages = <TBlueprint extends CascadeBlueprint>(
  points: readonly InsightPoint[],
  stages: readonly StageNameFromManifest<TBlueprint>[],
): readonly InsightPoint[] => points.filter((point) => stages.includes(point.stage as StageNameFromManifest<TBlueprint>));

export const dedupeInsights = (points: readonly InsightPoint[]): readonly InsightPoint[] => {
  const map = new Map<string, InsightPoint>();
  for (const point of points) {
    map.set(`${point.kind}:${point.stage}:${point.severity}`, point);
  }
  return [...map.values()];
};

export const estimateRiskTrajectory = (points: readonly InsightPoint[]): readonly number[] => {
  let cursor = 0;
  return points.map((point) => {
    cursor = Number((cursor + point.score) / 2);
    return Number(cursor.toFixed(5));
  });
};
