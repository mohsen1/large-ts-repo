import { withBrand } from '@shared/core';
import type { RecoverySignal } from './types';
import type { CandidateRoute } from './route-intelligence';

export interface TimelineStep {
  readonly stepId: string;
  readonly routeId: string;
  readonly title: string;
  readonly sourceSignalId: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly state: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked';
}

export interface OperationTimeline {
  readonly timelineId: string;
  readonly tenant: string;
  readonly runId: string;
  readonly steps: readonly TimelineStep[];
  readonly completed: number;
  readonly failed: number;
  readonly generatedAt: string;
}

const buildStepTitle = (route: CandidateRoute): string => {
  return `${route.intent.toUpperCase()}-${route.signalId}`;
};

export const buildTimeline = (tenant: string, runId: string, routes: readonly CandidateRoute[]): OperationTimeline => {
  const steps = routes.map((route, index) => {
    const startedAt = new Date(Date.now() + index * 300).toISOString();
    const completedAt = index % 3 === 0 ? new Date(Date.now() + index * 300 + 800).toISOString() : undefined;
    const state: TimelineStep['state'] =
      completedAt
        ? index % 9 === 0
          ? 'failed'
          : 'succeeded'
        : index % 4 === 0
          ? 'running'
          : 'pending';

    return {
      stepId: withBrand(`${tenant}:${runId}:${route.routeId}`, 'RecoveryRouteKey'),
      routeId: route.routeId,
      title: buildStepTitle(route),
      sourceSignalId: route.signalId,
      startedAt,
      completedAt,
      state,
    } as TimelineStep;
  });

  return {
    timelineId: withBrand(`${tenant}:${runId}`, 'RecoveryRunId'),
    tenant,
    runId,
    steps,
    completed: steps.filter((step) => step.state === 'succeeded').length,
    failed: steps.filter((step) => step.state === 'failed').length,
    generatedAt: new Date().toISOString(),
  };
};

export const summarizeTimeline = (timeline: OperationTimeline): string => {
  return `${timeline.runId}:${timeline.steps.length}:${timeline.completed}:${timeline.failed}`;
};

export const timelineToSignalMap = (
  timeline: OperationTimeline,
  signals: readonly RecoverySignal[],
): ReadonlyMap<string, RecoverySignal> => {
  const map = new Map<string, RecoverySignal>();
  for (const step of timeline.steps) {
    const index = Number(step.sourceSignalId.replace(/^.*-(\d+)$/, '$1'));
    const signal = signals[index] ?? signals[0];
    if (signal) {
      map.set(step.routeId, signal);
    }
  }
  return map;
};
