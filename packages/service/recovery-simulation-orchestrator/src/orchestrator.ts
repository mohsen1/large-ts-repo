import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  buildManifest,
  materializeExecutionEntries,
  seedRunRecord,
  type SimulationCommand,
  type SimulationScenarioBlueprint,
  type SimulationRunRecord,
  type SimulationRunId,
  type SimulationState,
  type SimulationBatchResult,
  type SimulationPlanId,
  type SimulationStepExecution,
} from '@domain/recovery-simulation-core';
import type { SimulationRepository } from '@data/recovery-simulation-store';
import { summarizeRun } from '@data/recovery-simulation-store/src/adapters';
import { reportTelemetry } from './telemetry';
import type { SimulationRunEnvelope, SimulationRunRequest } from './types';

interface RecoverySimulationOrchestratorDeps {
  repository: SimulationRepository;
}

export class RecoverySimulationOrchestrator {
  constructor(private readonly deps: RecoverySimulationOrchestratorDeps) {}

  async runManifest(planId: SimulationPlanId): Promise<Result<SimulationRunEnvelope, Error>> {
    const scenarioId = `${planId}:scenario` as unknown as SimulationScenarioBlueprint['id'];
    const run = await this.prepareRun(scenarioId);
    if (!run.ok) {
      return fail(run.error);
    }
    return ok({
      runId: run.value.id,
      requestId: `${planId}:request`,
      status: 'accepted',
      startedAt: new Date().toISOString(),
    });
  }

  async prepareRun(scenarioId: SimulationScenarioBlueprint['id']): Promise<Result<SimulationRunRecord, Error>> {
    const manifestPlan = buildManifest(fakeScenario(scenarioId), 'auto-operator').manifest;
    const run = seedRunRecord(manifestPlan);

    const savedPlan = await this.deps.repository.savePlan(manifestPlan);
    const savedRun = await this.deps.repository.saveRun(run);
    if (!savedPlan || !savedRun) {
      return fail(new Error(`failed to persist run ${run.id}`));
    }

    return ok(run);
  }

  async runCommand(run: SimulationRunRecord, command: SimulationCommand): Promise<Result<SimulationRunRecord, Error>> {
    const nextState = this.nextState(run.state, command.command);
    const step: SimulationStepExecution = {
      stepId: (run.executedSteps[0]?.stepId ?? (run.id as unknown as SimulationStepExecution['stepId'])),
      state: nextState,
      metrics: [{ key: 'manual-command', value: 1 }],
    };

    const updated: SimulationRunRecord = {
      ...run,
      state: nextState,
      executedSteps: [...run.executedSteps, step],
    };

    await this.deps.repository.recordCommand(command);
    await this.deps.repository.appendStep(run.id, step);
    await this.deps.repository.saveRun(updated);

    summarizeRun(updated);
    reportTelemetry(updated);

    return ok(updated);
  }

  async executeBatch(request: SimulationRunRequest): Promise<Result<SimulationBatchResult, Error>> {
    const seeded = await this.prepareRun(request.planId as unknown as SimulationScenarioBlueprint['id']);
    if (!seeded.ok) {
      return fail(seeded.error);
    }

    let current = seeded.value;
    let elapsedMs = 0;

    for (const command of request.commands) {
      const next = await this.runCommand(current, command);
      if (!next.ok) {
        return fail(next.error);
      }
      current = next.value;
      elapsedMs += 250;
    }

    const completed = current.executedSteps.filter((step) => step.state === 'completed').length;
    const failed = current.executedSteps.filter((step) => step.state === 'failed').length;

    return ok({
      runId: current.id,
      summary: `commands=${request.commands.length}`,
      totalSteps: current.executedSteps.length,
      completedSteps: completed,
      failedSteps: failed,
      elapsedMs,
      commandCount: request.commands.length,
    });
  }

  private nextState(state: SimulationState, command: SimulationCommand['command']): SimulationState {
    if (command === 'abort') return 'cancelled';
    if (command === 'pause') return 'stalled';
    if (command === 'resume') return state === 'stalled' ? 'executing' : state;
    if (command === 'start') return 'executing';
    return state;
  }
}

const fakeScenario = (id: SimulationScenarioBlueprint['id']): SimulationScenarioBlueprint => ({
  id,
  title: 'simulated scenario',
  description: 'generated scenario for stress orchestration',
  severity: 'medium',
  owner: 'orchestrator',
  tags: ['auto'],
  targets: [
    {
      id: 'target-api' as unknown as SimulationScenarioBlueprint['targets'][number]['id'],
      label: 'api-gateway',
      region: 'us-east-1',
      serviceClass: 'critical',
      owner: 'platform',
      dependencies: [],
    },
  ],
  steps: [
    {
      id: 'sim-step' as SimulationScenarioBlueprint['steps'][number]['id'],
      title: 'Validate dependencies',
      targetId: 'target-api' as unknown as SimulationScenarioBlueprint['steps'][number]['targetId'],
      expectedDurationMs: 2_000,
      requiredActors: ['actor-ops' as unknown as SimulationScenarioBlueprint['steps'][number]['requiredActors'][number]],
      tags: ['boot'],
      riskSurface: 'app',
      recoveryCriticality: 3,
      dependsOn: [],
    },
  ],
});
