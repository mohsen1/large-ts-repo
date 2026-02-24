import { RecoveryPlan, RecoveryAction, EntityId } from '@domain/recovery-cockpit-models';
import { normalizeNumber } from '@shared/util';

export type ExecutionTempo = Readonly<{
  readonly planId: string;
  readonly windows: readonly TempoWindow[];
  readonly throughput: number;
  readonly jitterBufferMinutes: number;
  readonly maxConcurrentActions: number;
}>;

export type TempoWindow = Readonly<{
  readonly index: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly actionIds: readonly EntityId[];
  readonly cumulativeMinutes: number;
  readonly capacityUsage: number;
  readonly risk: 'low' | 'medium' | 'high';
}>;

const actionRisk = (item: RecoveryAction): number => {
  const criticalBoost = item.tags.includes('critical') ? 35 : 10;
  const retryPenalty = item.retriesAllowed * 5;
  return Math.min(100, criticalBoost + retryPenalty + item.expectedDurationMinutes * 0.6);
};

const normalizeWindowRisk = (items: readonly RecoveryAction[]): 'low' | 'medium' | 'high' => {
  const risk = items.reduce((acc, item) => acc + actionRisk(item), 0) / Math.max(1, items.length);
  if (risk >= 70) return 'high';
  if (risk >= 45) return 'medium';
  return 'low';
};

const windowStart = (index: number, windowLengthMinutes: number): string => {
  return new Date(Date.now() + index * windowLengthMinutes * 60_000).toISOString();
};

const windowEnd = (start: string, durationMinutes: number): string => {
  return new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString();
};

const splitIntoChunks = <T>(values: readonly T[], size: number): ReadonlyArray<readonly T[]> => {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
};

export const forecastExecutionTempo = (plan: RecoveryPlan): ExecutionTempo => {
  const windowLengthMinutes = Math.max(5, Math.floor(180 / Math.max(1, plan.actions.length)));
  const concurrencyTarget = plan.mode === 'automated' ? 4 : plan.mode === 'semi' ? 3 : 2;
  const actionGroups = splitIntoChunks(plan.actions, concurrencyTarget);

  let cumulative = 0;
  const windows = actionGroups.map((actions, index) => {
    const startAt = windowStart(index, windowLengthMinutes);
    const avgDuration = Math.max(2, actions.reduce((acc, action) => acc + action.expectedDurationMinutes, 0) / Math.max(1, actions.length));
    const capacityUsage = Math.min(100, (avgDuration / windowLengthMinutes) * 100);
    cumulative += avgDuration;
    return {
      index,
      startAt,
      endAt: windowEnd(startAt, avgDuration),
      actionIds: actions.map((action) => action.id),
      cumulativeMinutes: normalizeNumber(cumulative),
      capacityUsage: normalizeNumber(capacityUsage),
      risk: normalizeWindowRisk(actions),
    } as TempoWindow;
  });

  const throughput = normalizeNumber(plan.actions.length / Math.max(1, cumulative / 60));
  return {
    planId: plan.planId,
    windows,
    throughput,
    jitterBufferMinutes: normalizeNumber(windowLengthMinutes * 0.15),
    maxConcurrentActions: concurrencyTarget,
  };
};

export const canRunWithTempo = (plan: RecoveryPlan, budgetMinutes: number): boolean => {
  const tempo = forecastExecutionTempo(plan);
  const projected = tempo.windows.reduce((acc, window) => acc + window.capacityUsage, 0) / Math.max(1, tempo.windows.length);
  const safetyMargin = Math.max(1, 1 + (budgetMinutes - projected) / 100);
  return safetyMargin > 0.82 && tempo.windows.every((window) => window.risk !== 'high');
};

export const listTempoActionIds = (tempo: ExecutionTempo): ReadonlyArray<EntityId> => tempo.windows.flatMap((window) => window.actionIds);

export const summarizeTempo = (tempo: ExecutionTempo): string => {
  const totalMinutes = tempo.windows.reduce((acc, window) => acc + (new Date(window.endAt).getTime() - new Date(window.startAt).getTime()) / 60_000, 0);
  return `${tempo.planId}: ${tempo.windows.length} windows, ${tempo.maxConcurrentActions} parallel, total=${totalMinutes.toFixed(1)}m`;
};
