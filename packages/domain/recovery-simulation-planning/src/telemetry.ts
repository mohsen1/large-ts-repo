import type { ConstraintViolation, SimulationResult, SimulationSummary, SimulationWorkspace } from './types';
import { calculateReadinessScore, type SimulationInput } from './simulator';
import { runRecoverySimulation } from './simulator';
import { ok, type Result, fail } from '@shared/result';
import { withBrand } from '@shared/core';

export interface TelemetryEvent {
  readonly id: string;
  readonly kind: 'simulation-start' | 'simulation-finish' | 'violation' | 'summary';
  readonly simulationId: string;
  readonly at: string;
  readonly payload: unknown;
}

export interface WorkspaceSeries {
  readonly points: readonly {
    readonly at: string;
    readonly score: number;
    readonly failures: number;
  }[];
}

const buildSummary = (result: SimulationResult): SimulationSummary => {
  const score = calculateReadinessScore(result.samples) * 100 - result.riskScore;
  const failures = result.violations.length;

  return {
    id: result.id,
    scenarioId: result.profile.scenario.id,
    status: failures > 4 ? 'failed' : failures > 1 ? 'degraded' : 'ok',
    score: Math.max(0, Math.min(100, Math.round(score))),
    readinessState: result.readinessAtEnd,
    failureCount: failures,
    recommendedActions: result.violations.slice(0, 5).map((violation) => violation.ruleId),
  };
};

export const summarizeSimulation = (result: SimulationResult): SimulationSummary => buildSummary(result);

export const buildSimulationTimeline = (result: SimulationResult): TelemetryEvent[] =>
  result.samples.map((sample, index) => ({
    id: `${result.id}:step-${index}`,
    kind: 'simulation-finish',
    simulationId: result.id,
    at: sample.endedAt ?? sample.startedAt,
    payload: {
      stepId: sample.stepId,
      ready: sample.success,
      readinessState: sample.readinessState,
      latencyMs: sample.latencyMs,
    },
  }));

export const classifyViolations = (violations: readonly ConstraintViolation[]): Readonly<Record<string, number>> => {
  const buckets: Record<string, number> = {};
  for (const violation of violations) {
    buckets[violation.ruleId] = (buckets[violation.ruleId] ?? 0) + 1;
  }
  return buckets;
};

export const projectWorkspaceSeries = (
  history: readonly SimulationSummary[],
  size = 20,
): WorkspaceSeries => {
  return {
    points: history.slice(-size).map((entry) => ({
      at: `${entry.id}:${entry.status}`,
      score: entry.score,
      failures: entry.failureCount,
    })),
  };
};

export const runAndEmitSimulationEvents = (input: SimulationInput): Result<{
  summary: SimulationSummary;
  workspace: SimulationWorkspace;
  telemetry: readonly TelemetryEvent[];
  series: WorkspaceSeries;
}, Error> => {
  const startedAt = new Date(input.now ?? new Date().toISOString()).toISOString();
  const runResult = runRecoverySimulation(input);
  if (!runResult.ok) {
    return fail(runResult.error);
  }

  const startEvent: TelemetryEvent = {
    id: `${input.profile.id}:start`,
    kind: 'simulation-start',
    simulationId: runResult.value.result.id,
    at: startedAt,
    payload: { tenant: input.profile.scenario.tenant, dryRun: input.dryRun },
  };

  const timeline = buildSimulationTimeline(runResult.value.result);
  const summary = summarizeSimulation(runResult.value.result);
  const violationEvents: TelemetryEvent[] = runResult.value.result.violations.map((violation) => ({
    id: `${runResult.value.result.id}:violation:${violation.ruleId}`,
    kind: 'violation',
    simulationId: runResult.value.result.id,
    at: violation.observedAt,
    payload: violation,
  }));
  const final: TelemetryEvent = {
    id: `${runResult.value.result.id}:summary`,
    kind: 'summary',
    simulationId: runResult.value.result.id,
    at: new Date().toISOString(),
    payload: summary,
  };

  const workspace: SimulationWorkspace = {
    scenarioId: input.profile.scenario.id,
    runId: input.profile.runId,
    token: withBrand(`${input.profile.runId}:${input.profile.id}`, 'RecoveryWindowToken'),
    activeStepIds: runResult.value.result.stepsExecuted,
    disabledStepIds: [],
    createdAt: startedAt,
  };

  const telemetry = [startEvent, ...timeline, ...violationEvents, final];
  return ok({
    summary,
    workspace,
    telemetry,
    series: projectWorkspaceSeries([summary], 1),
  });
};
