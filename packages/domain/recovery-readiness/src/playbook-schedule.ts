import type { ReadinessPlanWindow, ReadinessPriority, PlaybookDefinition } from './playbook-models';

export interface ScheduleInput {
  window: ReadinessPlanWindow;
  playbook: PlaybookDefinition;
  priority: ReadinessPriority;
  requestedAt: string;
}

export interface ScheduleDecision {
  playbookId: string;
  scheduledAt: string;
  queueName: string;
  reason: string[];
  maxConcurrency: number;
  allowParallelRun: boolean;
}

const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isInBlackoutWindow = (requested: number, window: ReadinessPlanWindow): boolean => {
  const date = new Date(requested);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  return window.blackoutWindows.some((entry) => entry.dayOfWeek === day && hour >= entry.startHour && hour <= entry.endHour);
};

const priorityQueue = {
  critical: 'recovery-critical',
  high: 'recovery-high',
  normal: 'recovery-normal',
  low: 'recovery-low',
} as const;

export const computeNextWindowStart = (input: ScheduleInput): string => {
  const requestedAt = Date.parse(input.requestedAt);
  const base = Number.isNaN(requestedAt) ? Date.now() : requestedAt;
  const cadenceMs = input.window.refreshCadenceMinutes * 60_000;
  const aligned = Math.ceil(base / cadenceMs) * cadenceMs;

  const window = new Date(aligned);
  const end = new Date(window.getTime() + input.window.horizonHours * 60 * 60_000);

  if (window.getTime() > end.getTime()) {
    return new Date(window.getTime() + cadenceMs).toISOString();
  }

  if (isInBlackoutWindow(window.getTime(), input.window)) {
    return new Date(window.getTime() + 60 * 60_000).toISOString();
  }

  return window.toISOString();
};

export const evaluateSchedule = (input: ScheduleInput): ScheduleDecision => {
  const scheduledAt = computeNextWindowStart(input);
  const allowParallelRun = input.window.allowParallelRun && input.priority !== 'critical';
  const reasons = [] as string[];

  if (input.window.maxConcurrency <= 0) {
    reasons.push('Max concurrency is not configured');
  }

  if (!allowParallelRun) {
    reasons.push('Parallel execution disabled for critical operations');
  }

  if (isInBlackoutWindow(Date.parse(input.requestedAt), input.window)) {
    reasons.push('Requested time overlaps blackout policy');
  }

  const queueName = priorityQueue[input.priority];
  return {
    playbookId: input.playbook.id,
    scheduledAt,
    queueName,
    reason: reasons,
    maxConcurrency: Math.max(1, input.window.maxConcurrency),
    allowParallelRun,
  };
};

export const describeSchedule = (decision: ScheduleDecision): string => {
  const weekdayLabel = weekday[new Date(decision.scheduledAt).getUTCDay()];
  const summary = [
    `queue=${decision.queueName}`,
    `scheduled=${decision.scheduledAt}`,
    `weekday=${weekdayLabel}`,
    `parallel=${decision.allowParallelRun ? 'enabled' : 'disabled'}`,
    `limit=${decision.maxConcurrency}`,
  ].join(' ');
  if (decision.reason.length === 0) {
    return `playbook ${decision.playbookId} scheduled at ${summary}`;
  }
  return `playbook ${decision.playbookId} scheduled with warnings [${decision.reason.join('; ')}] at ${summary}`;
};

export const isHighPriorityWindow = (window: ReadinessPlanWindow, now = Date.now()) => {
  const cadenceHours = window.refreshCadenceMinutes / 60;
  return now < (window.horizonHours * 60) && cadenceHours <= 5;
};
