import { createEnvelope, type Envelope } from '@shared/protocol';
import type {
  SimulationRunId,
  SimulationScenarioId,
  SimulationRunRecord,
  SimulationPlanManifest,
  SimulationCommand,
} from './types';

export interface SimulationRunEnvelope {
  readonly envelope: Envelope<SimulationRunRecord>;
  readonly metadata: {
    readonly runId: SimulationRunId;
    readonly scenarioId: SimulationScenarioId;
    readonly stepCount: number;
  };
}

export const toRunEnvelope = (run: SimulationRunRecord): SimulationRunEnvelope => ({
  envelope: createEnvelope<SimulationRunRecord>('recovery.simulation.run', run),
  metadata: {
    runId: run.id,
    scenarioId: run.scenarioId,
    stepCount: run.executedSteps.length,
  },
});

export const commandToString = (command: SimulationCommand): string =>
  `${command.runId}:${command.actorId}:${command.command}`;

export const describePlan = (manifest: SimulationPlanManifest): string =>
  `${manifest.id} steps=${manifest.steps.length} budget=${manifest.expectedRecoveryBudgetMs} concurrency=${manifest.concurrencyLimit}`;
