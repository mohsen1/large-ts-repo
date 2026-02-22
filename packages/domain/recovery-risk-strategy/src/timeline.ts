import type { Brand } from '@shared/core';
import type {
  RiskWindowId,
  StrategyExecutionResult,
  StrategyExecutionState,
  StrategyExecutionLog,
  StrategySignalPack,
  SeverityTrend,
  StrategyExecutionSummary,
} from './types';

export interface StrategyTimelineEntry {
  readonly at: string;
  readonly runId: RiskWindowId;
  readonly state: StrategyExecutionState;
  readonly details: string;
}

export type StrategyTimelineWindow = {
  readonly windowId: RiskWindowId;
  readonly runId: Brand<string, 'RecoveryRunId'>;
  readonly ticks: readonly StrategyTimelineEntry[];
  readonly completedAt?: string;
};

const timelineSeed = (runId: RiskWindowId, state: StrategyExecutionState, details: string): StrategyTimelineEntry => ({
  at: new Date().toISOString(),
  runId,
  state,
  details,
});

export const initializeTimeline = (runId: RiskWindowId): readonly StrategyTimelineEntry[] => [
  timelineSeed(runId, 'queued', 'run accepted'),
  timelineSeed(runId, 'ready', 'inputs normalized'),
];

export const appendTimeline = (
  timeline: readonly StrategyTimelineEntry[],
  runId: RiskWindowId,
  state: StrategyExecutionState,
  details: string,
): readonly StrategyTimelineEntry[] => [...timeline, timelineSeed(runId, state, details)];

export const buildTimelineWindow = (
  runId: RiskWindowId,
  pack: StrategySignalPack,
  result: StrategyExecutionResult,
  telemetrySeed: SeverityTrend,
): StrategyTimelineWindow => {
  const base = initializeTimeline(runId);
  const scored = appendTimeline(base, runId, 'scored', `vectors=${pack.vectors.length}`);
  const enriched = appendTimeline(
    scored,
    runId,
    'enriched',
    `severity=${result.severityBand}, score=${result.run.score}`,
  );
  const bound = appendTimeline(enriched, runId, 'bound', `recommendation=${result.recommendation}`);
  const published = appendTimeline(
    bound,
    runId,
    'published',
    `totals=${telemetrySeed
      .map(([severity, total]) => `${severity}:${total}`)
      .join(',')}`,
  );
  const completed = appendTimeline(published, runId, 'complete', 'done');

  return {
    windowId: `${pack.scenarioId}:window` as RiskWindowId,
    runId: `${runId}:run` as Brand<string, 'RecoveryRunId'>,
    ticks: completed,
    completedAt: new Date().toISOString(),
  };
};

export const toAuditLogs = (timeline: readonly StrategyTimelineEntry[]): readonly StrategyExecutionLog[] =>
  timeline.map((entry) => ({
    runId: entry.runId,
    state: entry.state,
    timestamp: entry.at,
    note: entry.details,
  }));

export const timelineHasFailures = (timeline: readonly StrategyTimelineEntry[]): boolean =>
  timeline.some((entry) => entry.state === 'failed');

export const timelineContains = (timeline: readonly StrategyTimelineEntry[], state: StrategyExecutionState): boolean =>
  timeline.some((entry) => entry.state === state);

export const summarizeTimeline = (timeline: readonly StrategyTimelineEntry[]): string =>
  timeline.map((entry) => `${entry.at}:${entry.state}:${entry.details}`).join('\n');

export const buildSummary = (result: StrategyExecutionResult): StrategyExecutionSummary => ({
  runId: result.run.runId,
  scenarioId: result.run.scenarioId,
  score: result.run.score,
  severityBand: result.severityBand,
  recommendationCount: result.vector.vectors.length,
  state: result.logs.at(-1)?.state ?? 'complete',
});
