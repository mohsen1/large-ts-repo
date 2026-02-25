import { fail, ok, type Result } from '@shared/result';
import {
  type ChaosRunReport,
  type ChaosRunEvent,
  type ChaosRunState,
  summarizeEvents
} from '@service/recovery-chaos-orchestrator';
import type { StageBoundary } from '@domain/recovery-chaos-lab';

export interface Diagnosis {
  readonly runId: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly score: number;
  readonly failedStages: readonly string[];
}

export interface RunEnvelope {
  readonly report: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]>;
  readonly state: ChaosRunState;
  readonly summary: {
    readonly attempts: number;
    readonly failures: number;
  };
}

export function deriveSeverity(failures: number, attempts: number): Diagnosis['severity'] {
  if (attempts === 0) {
    return 'low';
  }

  const ratio = failures / attempts;
  if (ratio >= 0.3) {
    return 'high';
  }
  if (ratio >= 0.1) {
    return 'medium';
  }
  return 'low';
}

export function scoreFromAttempts(attempts: number, failures: number): number {
  if (attempts === 0) {
    return 1;
  }
  return Math.max(0, 1 - failures / attempts);
}

export function buildDiagnosis(
  report: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]>,
  state: ChaosRunState,
  events: readonly ChaosRunEvent[]
): Diagnosis {
  const summary = summarizeEvents(events);
  const severity = deriveSeverity(summary.failures, summary.attempts);
  const failedStages = events
    .filter((event) => event.kind === 'stage-failed')
    .map((event) => ('stage' in event && typeof event.stage === 'string' ? event.stage : `stage:${state.scenarioId}`));
  return {
    runId: report.runId,
    severity,
    score: scoreFromAttempts(summary.attempts, summary.failures),
    failedStages
  };
}

export function checkState(state: ChaosRunState): RunEnvelope['summary'] {
  const attempts = state.progress;
  const failures = state.status === 'failed' ? 1 : 0;
  return {
    attempts,
    failures
  };
}

export function diagnoseRun(
  report: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]>,
  state: ChaosRunState,
  events: readonly ChaosRunEvent[]
): Result<Diagnosis, Error> {
  try {
    if (!report || !state) {
      return fail(new Error('invalid report'));
    }
    return ok(buildDiagnosis(report, state, events));
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('diagnostic failure'));
  }
}
