import type { RecoveryPlan, RecoveryRun, RecoveryState, ScenarioAction, ConstraintSnapshot } from './types';

export interface ActionWindow {
  readonly actionId: string;
  readonly earliestAt: string;
  readonly latestAt: string;
}

export interface CandidateWindow {
  readonly action: ScenarioAction;
  readonly order: number;
  readonly window: ActionWindow;
  readonly dependencyIds: readonly string[];
  readonly blockers: readonly ConstraintSnapshot[];
}

const addMinutes = (base: string, minutes: number): string => {
  const ms = Date.parse(new Date(base).toISOString());
  return new Date(ms + minutes * 60_000).toISOString();
};

export const buildExecutionWindows = (plan: RecoveryPlan, constraints: readonly ConstraintSnapshot[]): readonly CandidateWindow[] => {
  const started = plan.createdAt;
  let offset = 0;

  return plan.actions.map((action, index) => {
    const earliest = addMinutes(started, index * 2 + offset);
    const latest = addMinutes(started, index * 2 + offset + 5 + Math.min(action.estimatedMinutes, 30));
    offset += action.requiredApprovals;

    const blockers = constraints.filter((constraint) => constraint.state === 'violated');

    return {
      action,
      order: index,
      window: {
        actionId: String(action.id),
        earliestAt: earliest,
        latestAt: latest,
      },
      dependencyIds: index === 0 ? [] : [String(plan.actions[index - 1].id)],
      blockers,
    };
  });
};

export const normalizeSchedule = (windows: readonly CandidateWindow[]): readonly CandidateWindow[] => {
  return [...windows].sort((left, right) => {
    if (left.order === right.order) {
      return left.action.requiredApprovals - right.action.requiredApprovals;
    }
    return left.order - right.order;
  });
};

export const canRunNow = (window: CandidateWindow, now: string): boolean => {
  const nowMs = Date.parse(now);
  const start = Date.parse(window.window.earliestAt);
  const stop = Date.parse(window.window.latestAt);
  return nowMs >= start && nowMs <= stop && window.blockers.length === 0;
};

export const snapshotState = (_: readonly CandidateWindow[]): RecoveryState => 'running';

export const scheduleWindowCoverage = (plan: RecoveryPlan, windows: readonly CandidateWindow[]): Readonly<Record<number, RecoveryRun['id']>> => {
  const entries: Record<number, RecoveryRun['id']> = {};
  for (const window of windows) {
    entries[window.order] = `${plan.id}:${window.action.id}` as RecoveryRun['id'];
  }
  return entries;
};
