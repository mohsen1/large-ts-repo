import { InMemoryCockpitStore } from './memoryRepository';
import { CommandEvent, RecoveryPlan, RuntimeRun, CommandEvent as Event } from '@domain/recovery-cockpit-models';
import { rankByScore, rollingWindow } from '@shared/util';

export type TimelineKind = 'event' | 'run' | 'synthesis';

export type TimelineMarker = {
  readonly kind: TimelineKind;
  readonly at: string;
  readonly planId: string;
  readonly label: string;
  readonly value?: number;
  readonly details?: string;
};

type EventAccumulator = Readonly<{
  runId?: string;
  status: Event['status'];
  count: number;
}>;

const eventGroupLabel = (status: Event['status']): string => {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'active') return 'active';
  if (status === 'queued') return 'queued';
  return 'idle';
};

const mergeConsecutive = (events: readonly CommandEvent[]): ReadonlyArray<EventAccumulator> => {
  const map = new Map<string, EventAccumulator>();
  for (const event of events) {
    const key = `${event.runId ?? 'none'}:${event.status}`;
    const previous = map.get(key);
    map.set(key, {
      runId: event.runId,
      status: event.status,
      count: (previous?.count ?? 0) + 1,
    });
  }
  return [...map.values()];
};

const createRunMarkers = (runs: readonly RuntimeRun[], planId: string): TimelineMarker[] => {
  return runs.flatMap((run, index) => {
    const score = run.completedActions.length + run.failedActions.length;
    return [
      {
        kind: 'run',
        at: run.startedAt,
        planId,
        label: `run #${index + 1} state=${run.state}`,
        value: score,
        details: `active=${run.activeActionIds.length} failed=${run.failedActions.length}`,
      },
    ];
  });
};

const createEventMarkers = (events: readonly CommandEvent[]): TimelineMarker[] => {
  return events.map((event, index) => {
    const suffix = index % 2 === 0 ? '[A]' : '[B]';
    return {
      kind: 'event',
      at: event.at,
      planId: event.planId,
      label: `${suffix} ${eventGroupLabel(event.status)} ${event.actionId}`,
      value: index,
      details: event.reason,
    };
  });
};

export const buildPlanTimeline = async (store: InMemoryCockpitStore, planId: string): Promise<readonly TimelineMarker[]> => {
  const planResult = await store.getPlan(planId as any);
  if (!planResult.ok || !planResult.value) {
    return [];
  }
  const plan = planResult.value as RecoveryPlan;
  const runsResult = await store.listRuns(planId as any);
  if (!runsResult.ok) {
    return [];
  }
  const events = await store.getEvents(planId as any, 500);
  const byStatus = mergeConsecutive(events);

  const runMarkers = createRunMarkers(runsResult.value, plan.planId);
  const eventMarkers = createEventMarkers(events);
  const statusMarkers = byStatus.map((summary) => ({
    kind: 'synthesis' as const,
    at: new Date().toISOString(),
    planId,
    label: `${summary.status} count=${summary.count}`,
    value: summary.count,
    details: `run=${summary.runId ?? 'n/a'}`,
  }));

  const ranking = rankByScore([...runMarkers, ...eventMarkers, ...statusMarkers], (marker) => marker.value ?? 0);
  return ranking;
};

export const buildPlanTimelineWindow = (items: readonly TimelineMarker[], windowMinutes = 30): readonly TimelineMarker[][] => {
  const sorted = [...items].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  const ordered = sorted.map((item) => ({ ...item, at: item.at }));
  return rollingWindow(ordered, Math.max(1, windowMinutes)).map((window) => [...window]);
};
