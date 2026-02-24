import type { ConstellationEvent, ConstellationEventCategory } from './plugins';
import type { ConstellationMode, ConstellationStage, ConstellationTemplateId } from './ids';

export type TimelinePoint = {
  readonly at: string;
  readonly stage: ConstellationStage;
  readonly category: ConstellationEventCategory;
  readonly note: string;
};

export type PluginMetric = {
  readonly pluginId: ConstellationTemplateId;
  readonly mode: ConstellationMode;
  readonly kind: ConstellationEventCategory;
  readonly score: number;
};

export interface TelemetryEnvelope {
  readonly runId: ConstellationTemplateId;
  readonly points: readonly TimelinePoint[];
  readonly pluginScores: readonly PluginMetric[];
}

export const toTimelinePoint = (event: ConstellationEvent, stage: ConstellationStage): TimelinePoint => ({
  at: event.timestamp,
  stage,
  category: event.kind,
  note: event.message,
});

const scoreByCategory = (events: readonly ConstellationEvent[]): Record<ConstellationEventCategory, number> => {
  const seed: Record<ConstellationEventCategory, number> = {
    metric: 0,
    risk: 0,
    policy: 0,
    telemetry: 0,
    plan: 0,
  };
  return events.reduce((acc, event) => {
    const weight = Math.max(0, event.tags.length);
    return {
      ...acc,
      [event.kind]: acc[event.kind] + weight,
    };
  }, seed);
};

export const aggregateTelemetry = (
  runId: ConstellationTemplateId,
  events: readonly ConstellationEvent[],
): TelemetryEnvelope => {
  const ordered = events.toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));
  const orderedStages = ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'] as const;
  const timeline = ordered.map((event, index) => toTimelinePoint(event, orderedStages[index % orderedStages.length]));

  const totals = scoreByCategory(ordered);
  const pluginScores = (Object.entries(totals) as [string, number][]).map(([kind, score]) => ({
    pluginId: runId,
    mode: 'analysis' as ConstellationMode,
    kind: kind as ConstellationEventCategory,
    score,
  }));

  return {
    runId,
    points: timeline,
    pluginScores,
  };
};

export const totalTelemetryScore = (envelope: TelemetryEnvelope): number =>
  envelope.pluginScores.reduce((acc, metric) => acc + metric.score, 0);

export const telemetryScoreByStage = (events: readonly TimelinePoint[], stage: ConstellationStage): number =>
  events.filter((entry) => entry.stage === stage).length * 9;

export const buildPulse = (events: readonly ConstellationEvent[], stages: readonly ConstellationStage[]): readonly TimelinePoint[] => {
  const normalizedStages = stages.length === 0
    ? ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'] as const
    : stages;
  return events.map((event, index) => ({
    at: event.timestamp,
    stage: normalizedStages[index % normalizedStages.length],
    category: event.kind,
    note: event.message,
  }));
};
