import { useMemo } from 'react';
import {
  buildHorizonPath,
  type HorizonStage,
  type StageChain,
  defaultStages,
} from '@domain/recovery-stress-lab';
import type { EngineRunSummary, StageEvent } from '@service/recovery-stress-lab-orchestrator/src/horizon-execution-engine';

export interface TimelineSegment {
  readonly stage: HorizonStage;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly pluginId: string;
  readonly output: string;
  readonly path: string;
}

export interface TimelineBucket {
  readonly name: HorizonStage;
  readonly value: number;
  readonly count: number;
}

export interface UseHorizonLabTimelineResult {
  readonly segments: readonly TimelineSegment[];
  readonly buckets: readonly TimelineBucket[];
  readonly route: StageChain;
  readonly totalDurationMs: number;
}

const normalize = (event: StageEvent): TimelineSegment => {
  const route = buildHorizonPath(`${event.timestamp}|${event.pluginId}|${event.stage}`) as string;
  return {
    stage: event.stage,
    startedAt: event.timestamp,
    durationMs: event.durationMs,
    pluginId: event.pluginId,
    output: event.output,
    path: route,
  };
};

export const useHorizonLabTimeline = (summary?: EngineRunSummary | null): UseHorizonLabTimelineResult => {
  const timeline = summary?.timeline ?? [];

  return useMemo(() => {
    const segments = timeline.map((event) => normalize(event));
    const seed = Object.fromEntries(defaultStages.map((stage) => [stage, 0])) as Record<HorizonStage, number>;
    const buckets = segments.reduce<Record<HorizonStage, number>>((acc, segment) => {
      acc[segment.stage] = (acc[segment.stage] ?? 0) + segment.durationMs;
      return acc;
    }, seed);

    const bucketViews = (Object.entries(buckets) as [HorizonStage, number][]).map(([name, value]) => ({
      name,
      value,
      count: timeline.filter((entry) => entry.stage === name).length,
    }));

    return {
      segments,
      buckets: bucketViews,
      route: (summary?.state.route ?? 'sense/assess/plan/simulate/approve/execute/verify/close') as StageChain,
      totalDurationMs: segments.reduce((acc, segment) => acc + segment.durationMs, 0),
    };
  }, [summary]);
};
