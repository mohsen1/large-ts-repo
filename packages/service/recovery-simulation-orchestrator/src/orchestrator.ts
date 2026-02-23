import { fail, ok, type Result } from '@shared/result';
import {
  buildManifest,
  seedRunRecord,
  type SimulationCommand,
  type SimulationScenarioBlueprint,
  type SimulationRunRecord,
  type SimulationPlanId,
  type SimulationRunId,
  type SimulationState,
  type SimulationBatchResult,
} from '@domain/recovery-simulation-core';
import type { SimulationRepository } from '@data/recovery-simulation-store';
import { summarizeRun } from '@data/recovery-simulation-store/src/adapters';
import { reportTelemetry } from './telemetry';
import type { SimulationRunEnvelope, SimulationRunRequest } from './types';
import { validateAndBuildLabPlan } from './validators';
import { createSchedulerState, drainCommand, isRunActive, scheduleRun, tickScheduler } from './scheduler';
import { buildDashboard } from './telemetry-dashboard';
import { defaultLabBlueprint, defaultLabDraft } from '@domain/recovery-simulation-lab-models/src/catalog';
import { buildSimulationPlan } from '@domain/recovery-simulation-lab-models/src/planner';

interface RecoverySimulationOrchestratorDeps {
  readonly repository: SimulationRepository;
}

export type { SimulationRunId };

export class RecoverySimulationOrchestrator {
  private schedulerState = createSchedulerState();

  constructor(private readonly deps: RecoverySimulationOrchestratorDeps) {}

  async runManifest(planId: SimulationPlanId): Promise<Result<SimulationRunEnvelope, Error>> {
    const scenario = fakeScenario(planId);
    const manifest = buildManifest(scenario, 'manual-orchestrator');
    const blueprint = defaultLabBlueprint(`${planId}:blueprint`);
    const draft = defaultLabDraft(blueprint.id);

    const validation = validateAndBuildLabPlan(blueprint, draft, manifest);
    if (!validation.ok || !validation.result) {
      return fail(new Error('plan validation failed'));
    }

    const run = await this.prepareRun(planId);
    if (!run.ok) {
      return fail(run.error);
    }

    this.schedulerState = scheduleRun(this.schedulerState, run.value, 'start');
    buildDashboard(run.value);

    return ok({
      runId: run.value.id,
      requestId: `${planId}:request`,
      status: 'accepted',
      startedAt: new Date().toISOString(),
    });
  }

  async prepareRun(planId: SimulationPlanId): Promise<Result<SimulationRunRecord, Error>> {
    const manifest = buildManifest(fakeScenario(planId), 'auto-operator').manifest;
    const run = seedRunRecord(manifest);

    const prepared = await this.deps.repository.savePlan(manifest);
    const saved = await this.deps.repository.saveRun(run);
    if (!prepared || !saved) {
      return fail(new Error(`failed to persist run ${run.id}`));
    }
    return ok(run);
  }

  async runCommand(
    run: SimulationRunRecord,
    command: SimulationCommand,
    includeDashboard = false,
  ): Promise<Result<SimulationRunRecord, Error>> {
    const nextState = this.nextState(run.state, command.command);
    const step = {
      stepId: run.executedSteps[0]?.stepId ?? (run.id as unknown as SimulationRunRecord['executedSteps'][number]['stepId']),
      state: nextState,
      startedAt: new Date().toISOString(),
      metrics: [{ key: 'manual-command', value: 1 }],
    } as SimulationRunRecord['executedSteps'][number];

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

    if (includeDashboard) {
      buildDashboard(updated);
    }

    return ok(updated);
  }

  async executeBatch(request: SimulationRunRequest): Promise<Result<SimulationBatchResult, Error>> {
    const seeded = await this.prepareRun(request.planId);
    if (!seeded.ok) {
      return fail(seeded.error);
    }

    const scenarioPlan = buildSimulationPlan(
      {
        blueprint: defaultLabBlueprint(String(request.planId)),
        draft: defaultLabDraft(String(request.planId)),
      },
      { enforceCapacity: true, includeWarnings: true },
    );

    let current = seeded.value;
    let elapsedMs = 0;

    for (const command of request.commands) {
      const next = await this.runCommand(current, command);
      if (!next.ok) {
        return fail(next.error);
      }
      current = next.value;
      elapsedMs += 250;

      const tick = tickScheduler(this.schedulerState, elapsedMs);
      this.schedulerState = tick.state;
      void scenarioPlan;
      void tick;
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

  queueDrain(): CommandEnvelope | undefined {
    const [state, next] = drainCommand(this.schedulerState);
    this.schedulerState = state;
    return next;
  }

  isRunQueued(runId: string): boolean {
    return isRunActive(this.schedulerState, runId);
  }

  private nextState(state: SimulationState, command: SimulationCommand['command']): SimulationState {
    if (command === 'abort') return 'cancelled';
    if (command === 'pause') return 'stalled';
    if (command === 'resume') return state === 'stalled' ? 'executing' : state;
    if (command === 'start') return 'executing';
    return state;
  }
}

import type { CommandEnvelope } from './command-queue';

const fakeScenario = (id: SimulationPlanId): SimulationScenarioBlueprint => ({
  id: `${id}:scenario` as unknown as SimulationScenarioBlueprint['id'],
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
      targetId: 'target-api' as SimulationScenarioBlueprint['steps'][number]['targetId'],
      expectedDurationMs: 2_000,
      requiredActors: ['actor-ops' as SimulationScenarioBlueprint['steps'][number]['requiredActors'][number]],
      tags: ['boot'],
      riskSurface: 'app',
      recoveryCriticality: 3,
      dependsOn: [],
    },
  ],
});
