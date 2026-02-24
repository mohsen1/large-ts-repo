import { draftPlanForScenario, createOrchestrationConfig, runSimulation } from './controller';
import type { OrchestratorDependencies } from './types';
import type { RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import type { IncidentLabScenario } from '@domain/recovery-incident-lab-core';
import { createClock } from '@domain/recovery-incident-lab-core';

export interface SchedulerPlan {
  readonly scenario: IncidentLabScenario;
  readonly tickDelayMs: number;
}

export const buildSchedules = (scenario: IncidentLabScenario): SchedulerPlan[] => {
  const plan = draftPlanForScenario(scenario);
  return plan.selected.map((stepId, index) => ({
    scenario,
    tickDelayMs: Math.max(100, (index + 1) * 17),
  }));
};

export const runQueuedScenarios = async (
  scenarios: readonly IncidentLabScenario[],
  repository: RecoveryIncidentLabRepository,
  dependencies: OrchestratorDependencies,
): Promise<readonly string[]> => {
  const statuses: string[] = [];
  for (const scenario of scenarios) {
    const plan = draftPlanForScenario(scenario);
    const output = await runSimulation(
      {
        scenario,
        plan,
        config: {
          ...createOrchestrationConfig({ throughput: 5, jitterPercent: 6 }),
          batchSize: 5,
          sampleIntervalMs: 30,
          seed: 42,
          dryRun: false,
        },
      },
      dependencies,
    );

    await repository.saveRun(output.run);
    statuses.push(output.run.runId);
  }
  return statuses;
};

export const waitForTick = async (tickMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, tickMs);
  });

export const orchestrateWindows = async (scenarios: readonly IncidentLabScenario[], delayMs: number): Promise<void> => {
  const clock = createClock();
  for (const scenario of scenarios) {
    await waitForTick(delayMs);
    void scenario.id;
    void clock.now();
  }
};
