import { type CommandState, type HubCheckpoint, type HubExecution, type HubRunId, type HubTenantId } from './types';

export interface ControlWindow {
  readonly id: string;
  readonly runId: HubRunId;
  readonly tenantId: HubTenantId;
  readonly from: string;
  readonly to: string;
  readonly state: CommandState;
}

export interface WindowSnapshot {
  readonly runId: HubRunId;
  readonly windows: readonly ControlWindow[];
  readonly activeWindowIndex: number;
  readonly timelineHash: string;
}

const addMinutes = (anchor: string, minutes: number): string => {
  const date = new Date(anchor);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
};

export const buildWindows = (execution: HubExecution, windows = 6): readonly ControlWindow[] => {
  if (windows <= 0) {
    return [];
  }

  const base = new Date(Date.now() + execution.checkpoints.length * 2 * 60 * 1000);
  const spanMs = Math.max(5, Math.round(execution.run.riskScore / 10));
  const list: ControlWindow[] = [];

  for (let index = 0; index < windows; index++) {
    const from = addMinutes(base.toISOString(), index * spanMs);
    const to = addMinutes(from, spanMs);
    const state: CommandState = index === 0 ? execution.run.state : index % 3 === 0 ? 'executing' : 'scheduled';

    list.push({
      id: `${execution.run.runId}:${index}`,
      runId: execution.run.runId,
      tenantId: execution.run.tenantId,
      from,
      to,
      state,
    });
  }

  return list;
};

export const diffWindows = (baseline: readonly ControlWindow[], latest: readonly ControlWindow[]): readonly string[] => {
  const map = new Map<string, ControlWindow>();
  for (const window of baseline) {
    map.set(window.id, window);
  }

  const deltas: string[] = [];
  for (const window of latest) {
    const previous = map.get(window.id);
    if (!previous) {
      deltas.push(`new-window:${window.id}`);
      continue;
    }
    if (previous.state !== window.state) {
      deltas.push(`state-change:${window.id}:${previous.state}->${window.state}`);
    }
    if (previous.from !== window.from || previous.to !== window.to) {
      deltas.push(`window-shift:${window.id}`);
    }
  }

  return deltas;
};

export const snapshotTimeline = (execution: HubExecution): WindowSnapshot => {
  const windows = buildWindows(execution);
  const activeWindowIndex = windows.findIndex((window) => window.state === execution.run.state);
  const normalized = windows
    .map((window) => `${window.id}|${window.state}|${window.from}-${window.to}`)
    .join('||');

  return {
    runId: execution.run.runId,
    windows,
    activeWindowIndex: Math.max(0, activeWindowIndex),
    timelineHash: `${execution.run.runId}:${normalized.length}:${normalized.split('|').length}`,
  };
};

export const enrichTimeline = (execution: HubExecution, checkpoints: readonly HubCheckpoint[]): readonly string[] => {
  const snapshot = snapshotTimeline(execution);
  const markerIndex = checkpoints.length % snapshot.windows.length;
  const window = snapshot.windows[markerIndex] ?? snapshot.windows[snapshot.windows.length - 1];
  if (!window) {
    return [];
  }

  return checkpoints.map((checkpoint) => `${checkpoint.key}@${window.id}`);
};
