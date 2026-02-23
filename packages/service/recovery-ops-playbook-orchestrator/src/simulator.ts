import { summarizeWindows, buildProgressTimeline, scoreQuality } from './analytics';
import type { StepWindow } from './analytics';
import type { PlaybookExecutionPlan, PlaybookRun } from '@domain/recovery-ops-playbook';
import { buildSnapshot } from '@domain/recovery-ops-playbook';

export interface SimulatorContext {
  readonly seed: number;
  readonly allowRetry: boolean;
  readonly jitterMs: number;
}

export interface SimulatorInput {
  readonly plan: PlaybookExecutionPlan;
  readonly run: PlaybookRun;
  readonly context: SimulatorContext;
}

export interface SimulationRun {
  readonly id: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly metrics: {
    readonly completion: number;
    readonly failureCount: number;
    readonly totalLatencyMs: number;
  };
  readonly windows: readonly StepWindow[];
  readonly projection: ReturnType<typeof buildSnapshot>['projection'];
}

const jitter = (value: number, jitterMs: number, seed: number): number => {
  const seedFactor = (seed % 17) / 17;
  return Math.max(1, value + (seedFactor - 0.5) * jitterMs);
};

const stepDuration = (stepName: string): number => {
  if (stepName.includes('restore')) {
    return 960;
  }
  if (stepName.includes('isolate')) {
    return 720;
  }
  return 240;
};

export const runSimulation = ({ plan, run, context }: SimulatorInput): SimulationRun => {
  const order = context.allowRetry ? [...plan.order].reverse() : [...plan.order];
  const windows: StepWindow[] = [];
  let cursor = Date.parse(run.startedAt);
  let failureCount = 0;

  for (const stepId of order) {
    const duration = jitter(stepDuration(stepId), context.jitterMs, context.seed + stepId.length);
    const startedAt = new Date(cursor).toISOString();
    cursor += Math.round(duration);

    windows.push({
      stepId,
      startedAt,
      progress: 1,
      latencyMs: Math.round(duration),
    });

    const shouldFail = stepId.length % 3 === 0 && context.allowRetry && context.seed % 2 === 0;
    if (shouldFail) {
      failureCount += 1;
    }
  }

  const sortedWindows = buildProgressTimeline(windows);
  const quality = scoreQuality(sortedWindows);
  const stats = summarizeWindows(sortedWindows);
  const completion = Math.max(0, 1 - failureCount / Math.max(1, sortedWindows.length));

  return {
    id: `${run.id}-sim`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date(cursor).toISOString(),
    metrics: {
      completion,
      failureCount,
      totalLatencyMs: stats.totalLatencyMs,
    },
    windows: sortedWindows,
    projection: buildSnapshot(plan, sortedWindows as unknown as any[]).projection,
  };
};
