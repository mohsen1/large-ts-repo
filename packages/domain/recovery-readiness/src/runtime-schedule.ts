import type { ReadinessDirective, ReadinessSignal, ReadinessTarget, RecoveryReadinessPlan } from './types';
import { calculateWindowDensity, detectOverlaps, remainingCapacity, type TimeWindow } from './schedules';

export interface RuntimeWindow {
  windowId: string;
  windowOwner: string;
  startUtc: string;
  endUtc: string;
  capacity: number;
  state: 'open' | 'closing' | 'closed';
}

export interface RuntimeSchedule {
  runId: string;
  windows: readonly RuntimeWindow[];
  directivesByWindow: Record<string, readonly ReadinessDirective['directiveId'][]>;
  parallelismScore: number;
  slackMinutes: number;
}

export interface RuntimeForecast {
  runId: string;
  signalId: ReadinessSignal['signalId'];
  windowId: string;
  confidence: number;
}

export interface ScheduleQuery {
  includeClosed: boolean;
  minCapacity: number;
}

export function toRuntimeSchedule(model: {
  plan: RecoveryReadinessPlan;
  targets: readonly ReadinessTarget[];
  signals: readonly ReadinessSignal[];
  directives: readonly ReadinessDirective[];
  revision: number;
  updatedAt: string;
}): RuntimeSchedule {
  const windows: RuntimeWindow[] = model.plan.windows.map((window) => ({
    windowId: window.windowId,
    windowOwner: window.label,
    startUtc: window.fromUtc,
    endUtc: window.toUtc,
    capacity: remainingCapacity({
      owner: window.label,
      startUtc: window.fromUtc,
      endUtc: window.toUtc,
      capacity: 60,
    }),
    state: isOpen(window.toUtc) ? 'open' : isRecent(window.toUtc) ? 'closing' : 'closed',
  }));

  const byWindow = distributeDirectives(windows, model.directives);
  const parallelismScore = windows.reduce((sum, window) => sum + scoreWindow(window), 0);

  return {
    runId: model.plan.runId,
    windows,
    directivesByWindow: byWindow,
    parallelismScore: Number((parallelismScore / Math.max(1, windows.length)).toFixed(2)),
    slackMinutes: windows.reduce((sum, window) => sum + Math.max(0, window.capacity), 0),
  };
}

export function buildScheduleForPlan(plan: RecoveryReadinessPlan): RuntimeSchedule {
  return toRuntimeSchedule({
    plan,
    targets: plan.targets,
    signals: [],
    directives: plan.signals.map((signal) => ({
      directiveId: signal.signalId as unknown as ReadinessDirective['directiveId'],
      name: `signal-${signal.name}`,
      description: 'auto-generated',
      timeoutMinutes: 15,
      enabled: true,
      retries: 0,
      dependsOn: [],
    })),
    revision: 0,
    updatedAt: new Date().toISOString(),
  });
}

export function queryScheduleWindows(input: RuntimeSchedule, query: ScheduleQuery): readonly RuntimeWindow[] {
  return input.windows.filter((window) => {
    if (!query.includeClosed && window.state === 'closed') {
      return false;
    }
    return window.capacity >= query.minCapacity;
  });
}

export function forecastBySignal(schedule: RuntimeSchedule, signals: readonly ReadinessSignal[]): readonly RuntimeForecast[] {
  return signals.map((signal, index) => ({
    runId: schedule.runId,
    signalId: signal.signalId,
    windowId: schedule.windows[index % Math.max(1, schedule.windows.length)]?.windowId ?? 'none',
    confidence: Number((0.5 + (signal.signalId.length % 10) / 20).toFixed(3)),
  }));
}

export function rankSchedules(schedules: readonly RuntimeSchedule[]): readonly RuntimeSchedule[] {
  return [...schedules].sort((left, right) => {
    const parallelDelta = right.parallelismScore - left.parallelismScore;
    if (parallelDelta !== 0) {
      return parallelDelta;
    }
    return right.slackMinutes - left.slackMinutes;
  });
}

export function mergeSchedules(left: RuntimeSchedule, right: RuntimeSchedule): RuntimeSchedule {
  const map = new Map<string, RuntimeWindow>();
  for (const window of [...left.windows, ...right.windows]) {
    const existing = map.get(window.windowId);
    if (!existing) {
      map.set(window.windowId, window);
      continue;
    }
    map.set(window.windowId, {
      ...existing,
      capacity: existing.capacity + window.capacity,
      state: existing.state === 'open' ? existing.state : window.state,
    });
  }

  const mergedWindows = Array.from(map.values());
  return {
    runId: `${left.runId}:${right.runId}`,
    windows: mergedWindows,
    directivesByWindow: { ...left.directivesByWindow, ...right.directivesByWindow },
    parallelismScore: Number(((left.parallelismScore + right.parallelismScore) / 2).toFixed(3)),
    slackMinutes: left.slackMinutes + right.slackMinutes,
  };
}

export function estimateRecoveryWindow(input: { schedule: RuntimeSchedule; targets: readonly ReadinessTarget[]; targetId: string }): number {
  const target = input.targets.find((item) => item.id === input.targetId);
  if (!target) {
    return 0;
  }
  const modifier = target.criticality === 'critical' ? 0.8 : target.criticality === 'high' ? 1 : 1.2;
  const windows = input.schedule.windows.map((window) => ({
    owner: window.windowOwner,
    startUtc: window.startUtc,
    endUtc: window.endUtc,
    capacity: window.capacity,
  }));
  const density = calculateWindowDensity(windows);
  return Number((density * 100 * modifier).toFixed(2));
}

export function resolveOverlappingWindows(plan: RecoveryReadinessPlan): readonly TimeWindow[] {
  const windows = plan.windows.map((window) => ({
    owner: window.label,
    startUtc: window.fromUtc,
    endUtc: window.toUtc,
    capacity: Math.max(1, Number(window.label.length)),
  }));
  const overlaps = detectOverlaps(windows);
  return overlaps.flatMap((entry) => [entry.windowA, entry.windowB]);
}

function isOpen(toUtc: string): boolean {
  const now = Date.now();
  return Date.parse(toUtc) > now;
}

function isRecent(toUtc: string): boolean {
  return Date.now() - Date.parse(toUtc) < 60 * 60 * 1000;
}

function scoreWindow(window: RuntimeWindow): number {
  if (window.state === 'closed') {
    return 0;
  }
  return window.capacity * (window.state === 'open' ? 1 : 0.6);
}

function distributeDirectives(
  windows: readonly RuntimeWindow[],
  directives: readonly ReadinessDirective[],
): Record<string, ReadinessDirective['directiveId'][]> {
  const grouped = new Map<string, ReadinessDirective['directiveId'][]>();
  for (const window of windows) {
    grouped.set(window.windowId, []);
  }
  for (let index = 0; index < directives.length; index += 1) {
    const window = windows[index % Math.max(1, windows.length)];
    const next = [...(grouped.get(window.windowId) ?? []), directives[index]!.directiveId];
    grouped.set(window.windowId, next);
  }
  const out: Record<string, ReadinessDirective['directiveId'][]> = {};
  for (const [windowId, values] of grouped.entries()) {
    out[windowId] = values;
  }
  return out;
}
