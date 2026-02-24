import {
  draftPlan,
  buildSimulationTimeline,
  inferRisk,
  validatePlan,
  type IncidentLabScenario,
  type IncidentLabPlan,
  type IncidentLabRun,
  type IncidentLabSignal,
  type LabEventBus,
  createBus,
  createClock,
  type IncidentLabEnvelope,
  type EnvelopeId,
} from '@domain/recovery-incident-lab-core';
import { validateScenario } from '@domain/recovery-incident-lab-core';
import type { OrchestratorConfig, OrchestratorInput, OrchestratorOutput, OrchestrationConfig, OrchestratorStatus, OrchestratorDependencies } from './types';
import { InMemoryRecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';

const defaultConfig: OrchestratorConfig = {
  batchSize: 3,
  sampleIntervalMs: 25,
  seed: 1337,
  dryRun: false,
  targetThroughput: 3,
  jitterPercent: 2,
};

export const createStatusText = (state: OrchestratorStatus): string =>
  `${state.state} started=${state.startedAt} executed=${state.executed}`;

export const runSimulation = async (
  input: OrchestratorInput,
  dependencies: OrchestratorDependencies,
): Promise<OrchestratorOutput> => {
  const validation = validateScenario(input.scenario);
  const planValidation = validatePlan(input.plan);
  if (!validation.ok || !planValidation.ok) {
    throw new Error('invalid scenario or plan');
  }

  const timeline = buildSimulationTimeline(input.scenario, input.plan.queue, {
    stepsPerMinute: input.config.targetThroughput,
    jitterPercent: input.config.jitterPercent,
  });

  const run: IncidentLabRun = {
    runId: `${input.scenario.id}:run:${Date.now()}` as IncidentLabRun['runId'],
    planId: input.plan.id,
    scenarioId: input.scenario.id,
    startedAt: createClock().now(),
    state: 'active',
    results: timeline.map((entry, index) => ({
      stepId: input.plan.queue[index] ?? ('' as IncidentLabRun['results'][number]['stepId']),
      startAt: entry.at,
      finishAt: entry.at,
      status: inferRisk(entry) === 'red' ? 'failed' : 'done',
      logs: [entry.at],
      sideEffects: ['signal', entry.signals.length ? entry.signals[0].kind : 'none'],
    })),
  };

  const repo = new InMemoryRecoveryIncidentLabRepository();
  await repo.saveRun(run);

  if (dependencies && dependencies.onEvent) {
    const bus: LabEventBus<IncidentLabSignal> = createBus();
    const unsubscribe = bus.subscribe((signal) => {
      void dependencies.onEvent(
        {
          id: `${input.plan.id}:env:${Date.now()}` as unknown as EnvelopeId,
          labId: input.scenario.labId,
          scenarioId: input.scenario.id,
          payload: signal,
          createdAt: new Date().toISOString(),
          origin: 'controller',
        } satisfies IncidentLabEnvelope,
      ).catch(() => undefined);
    });

    for (const entry of timeline.flatMap((record) => record.signals)) {
      bus.publish(entry);
      if (!dependencies.shouldContinue()) {
        break;
      }
    }

    unsubscribe();
  }

  if (!input.config.dryRun) {
    // no-op branch to keep deterministic configuration dependency
    const jitter = input.config.jitterPercent;
    void jitter;
  }

  const telemetry: readonly IncidentLabEnvelope<unknown>[] = timeline.map((record) => ({
    id: `${input.scenario.id}:telemetry:${Date.now()}` as IncidentLabEnvelope['id'],
    labId: input.scenario.labId,
    scenarioId: input.scenario.id,
    payload: {
      throughput: record.vector.throughput,
      latencyMs: record.vector.latencyMs,
      integrityScore: record.vector.integrityScore,
    },
    createdAt: record.at,
    origin: 'controller',
  }));

  return { plan: input.plan, run, telemetry };
};

export const createOrchestrationConfig = (input: { jitterPercent?: number; throughput?: number; }): OrchestrationConfig => ({
  mode: input.throughput && input.throughput > 3 ? 'auto' : 'manual',
  targetThroughput: input.throughput ?? defaultConfig.batchSize,
  jitterPercent: input.jitterPercent ?? 0,
  maxParallelism: 4,
});

export const buildRunSummary = (run: IncidentLabRun): string => `${run.runId} state=${run.state} steps=${run.results.length}`;

export const startOrchestrator = async (
  input: OrchestratorInput,
  dependencies: OrchestratorDependencies,
): Promise<OrchestratorOutput> => {
  const status: OrchestratorStatus = {
    state: 'running',
    startedAt: createClock().now(),
    executed: 0,
  };

  void status;
  return runSimulation(input, dependencies);
};

export const draftPlanForScenario = (scenario: IncidentLabScenario): IncidentLabPlan =>
  draftPlan({ scenario, orderedBy: 'topology', requestedBy: scenario.owner }).plan;
