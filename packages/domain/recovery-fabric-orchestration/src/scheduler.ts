import type { RecoveryWindow } from '@domain/recovery-orchestration';
import type { FabricCommand, FabricPlan, FabricRun } from './types';
import { orderedExecutionPlan } from './graph';

export interface SchedulerWindowPlan {
  readonly commandId: FabricCommand['id'];
  readonly window: RecoveryWindow;
  readonly confidence: number;
  readonly reason: string;
}

export interface RunTimeline {
  readonly run: FabricRun['id'];
  readonly slots: readonly SchedulerWindowPlan[];
  readonly totalSlots: number;
  readonly totalDurationMinutes: number;
}

const byDate = (left: RecoveryWindow, right: RecoveryWindow): number => {
  return Date.parse(left.startsAt) - Date.parse(right.startsAt);
};

export const normalizeWindow = (start: string, end: string): RecoveryWindow => {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  return {
    startsAt: new Date(Math.min(startTime, endTime)).toISOString(),
    endsAt: new Date(Math.max(startTime, endTime)).toISOString(),
    timezone: 'UTC',
  };
};

export const isWindowEmpty = (window: RecoveryWindow): boolean => {
  return Date.parse(window.startsAt) >= Date.parse(window.endsAt);
};

export const intersectWindow = (a: RecoveryWindow, b: RecoveryWindow): RecoveryWindow | null => {
  const start = Math.max(Date.parse(a.startsAt), Date.parse(b.startsAt));
  const end = Math.min(Date.parse(a.endsAt), Date.parse(b.endsAt));
  if (start >= end) {
    return null;
  }
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    timezone: 'UTC',
  };
};

export const mergeWindows = (windows: readonly RecoveryWindow[]): RecoveryWindow[] => {
  const ordered = [...windows]
    .filter((window) => !isWindowEmpty(window))
    .sort(byDate)
    .map((window) => ({ ...window }));

  const merged: RecoveryWindow[] = [];
  for (const next of ordered) {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push(next);
      continue;
    }

    const overlap = intersectWindow(previous, next);
    if (overlap && overlap.endsAt > previous.endsAt) {
      previous.endsAt = overlap.endsAt;
      continue;
    }
    merged.push(next);
  }

  return merged;
};

export const availableWindows = (command: FabricCommand, allWindows: readonly RecoveryWindow[]): RecoveryWindow[] => {
  const filtered = allWindows.filter((window) =>
    command.requiresWindows.some((required) => intersectWindow(window, required) !== null),
  );

  return mergeWindows(filtered);
};

export const buildRunTimeline = (
  runId: FabricRun['id'],
  plan: FabricPlan,
  windows: readonly RecoveryWindow[],
): RunTimeline => {
  const order = orderedExecutionPlan(plan.topology);
  const sortedWindows = [...windows].sort(byDate);
  const commandMap = new Map(plan.commands.map((command) => [command.id, command]));
  const slots: SchedulerWindowPlan[] = [];

  let cursor = Date.parse(new Date().toISOString());
  for (const commandId of order) {
    const command = commandMap.get(commandId);
    if (!command) {
      continue;
    }

    const matches = availableWindows(command, sortedWindows);
    const matchedWindow = matches.find((window) => Date.parse(window.startsAt) >= cursor)
      ?? matches[0]
      ?? sortedWindows[0]
      ?? {
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(cursor + 3_600_000).toISOString(),
        timezone: 'UTC',
      };

    const durationMinutes = Math.max(command.estimatedRecoveryMinutes, 1);
    const startsAt = matchedWindow.startsAt;
    const endsAt = new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString();
    slots.push({
      commandId: command.id,
      window: {
        startsAt,
        endsAt,
        timezone: matchedWindow.timezone,
      },
      confidence: matches.length === 0 ? 0.4 : 0.82,
      reason: matches.length === 0 ? 'fallback scheduling used' : 'scheduled within overlap',
    });
    cursor = Date.parse(endsAt);
  }

  const totalDurationMinutes = slots.reduce(
    (acc, slot) => acc + (Date.parse(slot.window.endsAt) - Date.parse(slot.window.startsAt)) / 60_000,
    0,
  );

  return {
    run: runId,
    slots,
    totalSlots: slots.length,
    totalDurationMinutes,
  };
};

export const optimizeTimeline = (timeline: RunTimeline): RunTimeline => {
  const slots = [...timeline.slots]
    .map((slot, index) => ({
      ...slot,
      confidence: Math.min(1, slot.confidence + index * 0.05),
      reason: index === 0 ? `${slot.reason} (anchored)` : slot.reason,
    }))
    .sort((left, right) => byDate(left.window, right.window));

  return {
    ...timeline,
    slots,
  };
};

export const validateRunTimeline = (timeline: RunTimeline): boolean => {
  if (timeline.slots.length === 0) {
    return false;
  }

  for (const slot of timeline.slots) {
    if (slot.window.startsAt >= slot.window.endsAt) {
      return false;
    }
  }

  return true;
};
