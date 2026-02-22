import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';

import type {
  ConstraintViolation,
  RuntimeDecisionPoint,
  RecoverySimulationId,
  RecoveryRunId,
  SimulationProfile,
  SimulationResult,
  SimulationSample,
} from './types';
import { evaluateConstraints } from './constraints';
import { topologicalOrder } from './plan-graph';

export interface SimulationCursor {
  readonly simulationId: RecoverySimulationId;
  readonly scenarioId: RecoverySimulationId;
  readonly runId: RecoveryRunId;
}

export interface SimulationInput {
  readonly profile: SimulationProfile;
  readonly now: string;
  readonly dryRun: boolean;
}

export interface SimulationOutput {
  readonly result: SimulationResult;
  readonly decisionLog: readonly RuntimeDecisionPoint[];
}

const jitter = (seed: number, maxMs = 1500) =>
  Math.abs(Math.sin(seed) * maxMs) % maxMs;

const buildSamples = (profile: SimulationProfile, dryRun: boolean): readonly SimulationSample[] =>
  topologicalOrder(profile.scenario).flatMap((stepId) => {
    const step = profile.scenario.steps.find((candidate) => candidate.id === stepId)!;
    const startedAt = new Date().toISOString();
    const latencyMs = Math.round(
      jitter(step.expectedMinutes * 31, step.expectedMinutes * 45) + (dryRun ? 300 : 0),
    );
    const endedAt = new Date(Date.now() + latencyMs).toISOString();

    return [
      {
        stepId,
        startedAt,
        endedAt,
        latencyMs,
        success: true,
        readinessState: step.phase === 'verification' ? 'idle' : 'live',
        metadata: { dryRun, command: step.command },
      },
    ];
  });

export const calculateReadinessScore = (samples: readonly SimulationSample[]): number => {
  if (samples.length === 0) {
    return 0;
  }

  const successRate = samples.filter((sample) => sample.success).length / samples.length;
  const avgLatency = samples.reduce((sum, sample) => sum + sample.latencyMs, 0) / samples.length;
  const latencyFactor = Math.max(0, 1 - avgLatency / 50000);
  return Math.min(1, successRate * 0.7 + latencyFactor * 0.3);
};

const deriveDecisionLog = (samples: readonly SimulationSample[], violations: readonly ConstraintViolation[]) => {
  const points: RuntimeDecisionPoint[] = [];
  for (const sample of samples) {
    const impacted = violations.some((violation) => violation.stepId === sample.stepId);
    points.push({
      simulationId: withBrand(`sim-${sample.stepId}`, 'RecoverySimulationId'),
      stepId: sample.stepId,
      reasonCode: impacted ? 'auto_remediate' : 'pass',
      autoRemediated: impacted && sample.success,
      options: impacted ? ['retry', 'escalate', 'skip'] : ['continue'],
    });
  }
  return points;
};

export const runRecoverySimulation = (input: SimulationInput): Result<SimulationOutput, Error> => {
  if (input.profile.scenario.steps.length === 0) {
    return fail(new Error('simulation-failed-no-steps'));
  }
  if (input.profile.concurrencyCap < 1) {
    return fail(new Error('simulation-failed-invalid-capacity'));
  }

  const sampleSeed = Date.parse(input.now || new Date().toISOString());
  const samples = buildSamples(input.profile, input.dryRun);
  const started = new Date(input.now);
  const endedAt = samples.reduce((time, sample) => {
    const next = Date.parse(sample.endedAt ?? new Date(time).toISOString());
    return new Date(Math.max(time.getTime(), next));
  }, started);
  const durationMs = Math.max(1, endedAt.getTime() - started.getTime());
  const riskScore = (samples.reduce((total, sample) => total + (sample.latencyMs % 100) / 100, 0) % 10) +
    (sampleSeed % 3);

  const tentativeResult: SimulationResult = {
    id: withBrand(`sim-${input.profile.id}`, 'RecoverySimulationId'),
    profile: input.profile,
    stepsExecuted: samples.map((sample) => sample.stepId),
    samples,
    violations: [],
    riskScore,
    readinessAtEnd: samples.at(-1)?.readinessState ?? 'failed',
    executedAt: input.now,
    durationMs,
  };

  const violations = evaluateConstraints(input.profile, tentativeResult);
  const result: SimulationResult = {
    ...tentativeResult,
    violations,
  };
  const decisionLog = deriveDecisionLog(samples, violations);
  return ok({ result, decisionLog });
};
