import { randomUUID } from 'crypto';
import { normalizeLimit } from '@shared/core';
import type { SimulationActorId, SimulationCommand, SimulationRunId } from '@domain/recovery-simulation-core';

export interface CommandEnvelope {
  readonly command: SimulationCommand;
  readonly planId: string;
  readonly priority: number;
  readonly enqueuedAt: string;
  readonly requestId: string;
}

interface QueueState {
  readonly commands: readonly CommandEnvelope[];
}

export interface QueueStats {
  readonly total: number;
  readonly uniquePlans: number;
  readonly oldest?: string;
  readonly newest?: string;
}

const byPriority = (state: QueueState): QueueState => ({
  commands: [...state.commands].sort((left, right) => right.priority - left.priority),
});

export const enqueueCommand = (commands: readonly CommandEnvelope[], envelope: CommandEnvelope): readonly CommandEnvelope[] =>
  byPriority({ commands: [...commands, envelope] }).commands;

export const enqueueRunCommands = (
  commands: readonly CommandEnvelope[],
  runId: SimulationRunId,
  planId: string,
  commandType: SimulationCommand['command'],
): readonly CommandEnvelope[] => {
  const staged = {
    command: {
      requestId: `${runId}:request:${randomUUID()}`,
      runId,
      actorId: `${planId}:actor` as SimulationActorId,
      command: commandType,
      requestedAt: new Date().toISOString(),
    } as SimulationCommand,
    planId,
    priority: 2,
    enqueuedAt: new Date().toISOString(),
    requestId: randomUUID(),
  };

  return enqueueCommand(commands, staged);
};

export const dequeueCommand = (
  commands: readonly CommandEnvelope[],
): { readonly remaining: readonly CommandEnvelope[]; readonly next?: CommandEnvelope } => {
  if (commands.length === 0) {
    return { remaining: [], next: undefined };
  }

  const sorted = byPriority({ commands }).commands;
  const [next, ...remaining] = sorted;
  return { remaining, next };
};

export const drainByPlan = (commands: readonly CommandEnvelope[], planId: string): readonly CommandEnvelope[] =>
  commands.filter((command) => command.planId !== planId);

export const summarizeQueue = (commands: readonly CommandEnvelope[]): QueueStats => {
  const uniquePlans = new Set(commands.map((command) => command.planId)).size;
  const sorted = byPriority({ commands }).commands;
  return {
    total: normalizeLimit(commands.length),
    uniquePlans,
    oldest: sorted.at(-1)?.enqueuedAt,
    newest: sorted[0]?.enqueuedAt,
  };
};

export const queueByRun = (commands: readonly CommandEnvelope[], runId: SimulationRunId): readonly CommandEnvelope[] =>
  commands.filter((command) => command.command.runId === runId);
