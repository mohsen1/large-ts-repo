import type { SimulationRunRecord, SimulationCommand } from '@domain/recovery-simulation-core';
import {
  dequeueCommand,
  enqueueRunCommands,
  summarizeQueue,
  type CommandEnvelope,
  type QueueStats,
} from './command-queue';

export interface SchedulerState {
  readonly queue: readonly CommandEnvelope[];
  readonly activeRunIds: readonly string[];
}

export interface TickResult {
  readonly tick: number;
  readonly processed: number;
  readonly remaining: number;
  readonly snapshot: QueueStats;
}

export const createSchedulerState = (): SchedulerState => ({
  queue: [],
  activeRunIds: [],
});

export const scheduleRun = (
  state: SchedulerState,
  run: SimulationRunRecord,
  commandType: SimulationCommand['command'],
): SchedulerState => ({
  queue: enqueueRunCommands(state.queue, run.id, run.planId, commandType),
  activeRunIds: [...new Set([...state.activeRunIds, run.id])],
});

export const purgeRun = (state: SchedulerState, runId: string): SchedulerState => ({
  queue: state.queue.filter((command) => command.command.runId !== runId),
  activeRunIds: state.activeRunIds.filter((id) => id !== runId),
});

export const tickScheduler = (state: SchedulerState, tick: number): { readonly state: SchedulerState; readonly result: TickResult } => {
  const result = dequeueCommand(state.queue);
  const processed = result.next ? 1 : 0;

  const remainingState: SchedulerState = {
    queue: result.remaining,
    activeRunIds: state.activeRunIds.filter((runId) =>
      result.remaining.some((command) => command.command.runId === runId),
    ),
  };

  return {
    state: remainingState,
    result: {
      tick,
      processed,
      remaining: result.remaining.length,
      snapshot: summarizeQueue(state.queue),
    },
  };
};

export const isRunActive = (state: SchedulerState, runId: string): boolean => state.activeRunIds.includes(runId);

export const drainCommand = (state: SchedulerState): [SchedulerState, CommandEnvelope | undefined] => {
  const { remaining, next } = dequeueCommand(state.queue);
  const active =
    next === undefined
      ? state.activeRunIds.filter((runId) => remaining.some((command) => command.command.runId === runId))
      : state.activeRunIds;

  return [
    {
      queue: remaining,
      activeRunIds: active,
    },
    next,
  ];
};
