import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { createEnvelope, type Envelope } from '@shared/protocol';
import type { SimulationActorId, SimulationCommand, SimulationRunId, SimulationScenarioId } from '@domain/recovery-simulation-core';
import { isSimulationStoreArtifact } from './types';
import type { SimulationArtifactEnvelope } from './types';

export interface SimulationEvent {
  readonly runId: SimulationRunId;
  readonly scenarioId: SimulationScenarioId;
  readonly command: SimulationCommand['command'];
  readonly at: string;
}

export const toCommandEvent = (command: SimulationCommand): Envelope<SimulationEvent> =>
  createEnvelope<SimulationEvent>('recovery.simulation.command', {
    runId: command.runId,
    scenarioId: `${command.actorId}` as SimulationScenarioId,
    command: command.command,
    at: command.requestedAt,
  });

export interface SimulationRunSummary {
  readonly runId: SimulationRunId;
  readonly totalSteps: number;
  readonly totalIncidents: number;
}

export const summarizeRun = (run: { id: SimulationRunId; executedSteps: readonly { state: string }[]; incidentsDetected: number }): SimulationRunSummary => ({
  runId: run.id,
  totalSteps: run.executedSteps.length,
  totalIncidents: run.incidentsDetected,
});

export const decodeCommandEvent = (
  payload: Envelope<unknown>,
): Result<SimulationCommand, Error> => {
  if (payload.eventType !== 'recovery.simulation.command') {
    return fail(new Error(`invalid event type ${payload.eventType}`));
  }

  const command = payload.payload as Partial<SimulationCommand>;
  const commandValue = typeof command.command === 'string'
    ? command.command
    : undefined;

  if (
    typeof command.runId !== 'string'
    || typeof command.actorId !== 'string'
    || !['start', 'skip-step', 'pause', 'resume', 'abort'].includes(commandValue ?? '')
    || typeof command.requestedAt !== 'string'
    || typeof command.requestId !== 'string'
  ) {
    return fail(new Error('invalid command payload'));
  }

  return ok({
    runId: command.runId,
    actorId: command.actorId,
    command: commandValue as SimulationCommand['command'],
    requestedAt: command.requestedAt,
    requestId: command.requestId,
  });
};

export const assertArtifact = (value: unknown): Result<SimulationArtifactEnvelope, Error> => {
  if (!isSimulationStoreArtifact(value)) {
    return fail(new Error('invalid artifact envelope'));
  }
  return ok(value);
};
