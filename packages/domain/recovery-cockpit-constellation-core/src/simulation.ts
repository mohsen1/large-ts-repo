import { clamp, rankByScore } from '@shared/util';
import type {
  ConstellationMode,
  ConstellationStage,
  UtcIsoTimestamp,
  ConstellationRunId,
  ConstellationTemplateId,
  ConstellationTopology,
  StageScoreTuple,
} from './ids';
import type { ConstellationEvent, ConstellationEventCategory } from './plugins';

export type StageExecutionInput<T extends ConstellationStage = ConstellationStage> = Readonly<{
  readonly planId: string;
  readonly stage: T;
  readonly mode: ConstellationMode;
  readonly startedAt: string;
}>;

type StageTuple<T extends ConstellationStage, R extends readonly StageExecutionInput[] = []> = T extends ConstellationStage
  ? [...R, StageExecutionInput<T>]
  : R;

export type SimulationPath<TStages extends readonly ConstellationStage[]> = TStages extends readonly [infer TFirst, ...infer TRest]
  ? TFirst extends ConstellationStage
    ? StageTuple<TFirst, SimulationPath<Extract<TRest, readonly ConstellationStage[]>>>
    : readonly []
  : readonly [];

export type PluginResultTuple<T extends readonly ConstellationStage[] = readonly ConstellationStage[]> = {
  [K in keyof T]: T[K] extends ConstellationStage
    ? {
        readonly stage: T[K];
        readonly score: number;
        readonly events: readonly ConstellationEvent[];
      }
    : never;
};

export interface SimulationEnvelope<TStages extends readonly ConstellationStage[] = readonly ConstellationStage[]> {
  readonly runId: ConstellationRunId;
  readonly topology: ConstellationTopology;
  readonly path: SimulationPath<TStages>;
  readonly outputs: PluginResultTuple<TStages>;
  readonly events: readonly ConstellationEvent[];
  readonly overallScore: number;
}

type StageScore = { readonly stage: ConstellationStage; readonly score: number };
type WeightedScore = ReadonlyArray<{ readonly stage: ConstellationStage; readonly score: number; readonly weight: number }>;

const BASELINE_STAGES: readonly ConstellationStage[] = ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'];
const STAGE_WEIGHTS: Record<ConstellationStage, number> = {
  bootstrap: 1,
  ingest: 1.2,
  synthesize: 1.5,
  validate: 2,
  simulate: 1.6,
  execute: 1.5,
  recover: 1.3,
  sweep: 0.6,
};

const stageScore = (value: number, stage: ConstellationStage): number =>
  clamp(value * (STAGE_WEIGHTS[stage] ?? 1), 0, 100);

const buildWeightedScore = (scores: readonly StageScore[]): number => {
  const weighted: WeightedScore = scores.map((entry) => ({ ...entry, weight: STAGE_WEIGHTS[entry.stage] ?? 1 }));
  const totalWeight = weighted.reduce((acc, entry) => acc + entry.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }

  const weightedScore = weighted.reduce(
    (acc, entry) => acc + (entry.score * entry.weight) / totalWeight,
    0,
  );
  return clamp(Math.round(weightedScore * 10) / 10, 0, 100);
};

const clampWindow = <T>(values: readonly T[], cap: number): readonly T[] => values.slice(0, Math.max(0, cap));

const summarizeEvents = (events: readonly ConstellationEvent[]): Readonly<Record<ConstellationEventCategory, readonly ConstellationEvent[]>> => ({
  metric: events.filter((event) => event.kind === 'metric'),
  risk: events.filter((event) => event.kind === 'risk'),
  policy: events.filter((event) => event.kind === 'policy'),
  telemetry: events.filter((event) => event.kind === 'telemetry'),
  plan: events.filter((event) => event.kind === 'plan'),
});

export const normalizeTopology = (topology: ConstellationTopology): ConstellationTopology => ({
  nodes: topology.nodes.toSorted((left, right) => right.criticality - left.criticality),
  edges: topology.edges.toSorted((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
});

export const scoreByStage = (scores: readonly StageScore[]): readonly StageScoreTuple[] => {
  const ranked = rankByScore(scores, (entry) => entry.score);
  return ranked.map(
    (entry, index) =>
      [entry.stage, entry.score, new Date(Date.now() - index * 10_000).toISOString() as UtcIsoTimestamp] as const,
  );
};

export const inferDefaultPath = (topology: ConstellationTopology): readonly ConstellationStage[] => {
  const nodeDensity = topology.nodes.length > 0 ? topology.nodes.reduce((acc, node) => acc + node.actionCount, 0) : BASELINE_STAGES.length;
  const sorted = topology.nodes.toSorted((left, right) => right.criticality - left.criticality);
  if (!sorted.length) return BASELINE_STAGES;
  if (nodeDensity > 80) return BASELINE_STAGES.toReversed();
  if (nodeDensity > 40) return ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover'];
  return BASELINE_STAGES.slice(0, 6);
};

export const buildSimulationPath = <TStages extends readonly ConstellationStage[]>(
  stages: TStages,
): SimulationPath<TStages> => stages as unknown as SimulationPath<TStages>;

export const simulateRun = <TStages extends readonly ConstellationStage[]>(
  runId: ConstellationRunId,
  topology: ConstellationTopology,
  path: TStages,
  scoresByStage: readonly StageScore[],
  events: readonly ConstellationEvent[],
): SimulationEnvelope<TStages> => {
  const normalized = normalizeTopology(topology);
  const clamped = clampWindow(events, 1024);
  const ordered = rankByScore(scoresByStage, (entry) => entry.score).toSorted((left, right) => STAGE_WEIGHTS[left.stage] - STAGE_WEIGHTS[right.stage]);
  const outputPath = clampWindow(
    ordered.map((entry) => ({ stage: entry.stage, score: stageScore(entry.score, entry.stage), events: clamped })),
    path.length,
  ) as PluginResultTuple<TStages>;

  const eventsByKind: Record<ConstellationEventCategory, ConstellationEvent[]> = {
    metric: [],
    risk: [],
    policy: [],
    telemetry: [],
    plan: [],
  };
  for (const event of clamped) {
    eventsByKind[event.kind].push(event);
  }
  const scoreSeries = scoreByStage(ordered);
  const overallScore = buildWeightedScore(ordered);

  const normalizedEventsByKind: Record<ConstellationEventCategory, readonly ConstellationEvent[]> = eventsByKind;
  const riskEvents = normalizedEventsByKind.risk;
  return {
    runId,
    topology: normalized,
    path: path.length ? buildSimulationPath(path) : buildSimulationPath(inferDefaultPath(normalized) as TStages),
    outputs: outputPath,
    events: clamped.toSorted((left, right) => left.timestamp.localeCompare(right.timestamp)),
    overallScore: clamp(overallScore + scoreSeries.length + riskEvents.length, 0, 100),
  };
};
