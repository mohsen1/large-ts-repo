import type {
  RecoveryPlan,
  RecoveryRun,
  RecoveryState,
} from '@domain/recovery-scenario-orchestration';
import { canRunNow, type CandidateWindow } from '@domain/recovery-scenario-orchestration';

export interface WindowWithExecution extends CandidateWindow {
  readonly canRunNow: boolean;
}

export interface SchedulerState {
  readonly candidateWindows: readonly WindowWithExecution[];
  readonly activeRun: RecoveryRun | null;
  readonly state: RecoveryState;
}

const stamp = (): string => new Date().toISOString();

const toRun = (run: RecoveryRun): RecoveryRun => ({
  ...run,
  updatedAt: stamp(),
  progress: Math.min(100, run.progress + 12),
  state: 'running',
});

export const toExecutableWindows = (
  windows: readonly CandidateWindow[],
  now: string,
): readonly WindowWithExecution[] =>
  windows.map((window) => ({
    ...window,
    canRunNow: canRunNow(window, now),
  }));

export const nextAction = (windows: readonly CandidateWindow[]): WindowWithExecution | null => {
  const now = stamp();
  const ready = toExecutableWindows(windows, now);
  return ready.find((window) => window.canRunNow) ?? null;
};

export const applyRunState = (
  current: SchedulerState,
  run: RecoveryRun,
  plan: RecoveryPlan,
): { state: SchedulerState; plan: RecoveryPlan } => {
  const nextRun = toRun(run);

  if (nextRun.progress >= 100) {
    const doneRun: RecoveryRun = {
      ...nextRun,
      state: 'resolved' as RecoveryState,
      progress: 100,
      updatedAt: stamp(),
    };

    const nextPlan: RecoveryPlan = {
      ...plan,
      state: plan.actions.length > 1 ? 'running' : 'resolved',
      updatedAt: stamp(),
    };

    return {
      state: {
        ...current,
        activeRun: doneRun,
        state: doneRun.state,
      },
      plan: nextPlan,
    };
  }

  return {
    state: {
      ...current,
      activeRun: nextRun,
      state: 'running',
    },
    plan,
  };
};

export const buildSchedulerState = (windows: readonly CandidateWindow[]): SchedulerState => ({
  candidateWindows: toExecutableWindows(windows, stamp()),
  activeRun: null,
  state: 'planned',
});
