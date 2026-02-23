import { SignalStore } from './store';
import type { SignalFeedSnapshot, SignalPriority, SignalPlan } from '@domain/recovery-signal-intelligence';

export interface SnapshotFilter {
  tenantId?: string;
  facilityId?: string;
  minPriorityRank?: number;
  maxPriorityRank?: number;
}

export const filterSnapshots = (
  store: SignalStore,
  filter: SnapshotFilter
): SignalFeedSnapshot[] => {
  const all: SignalFeedSnapshot[] = [];

  if (filter.facilityId) {
    all.push(...store.snapshotForFacility(filter.facilityId));
  } else {
    for (let facility = 0; facility < 16; facility += 1) {
      const id = `facility-${facility}`;
      all.push(...store.snapshotForFacility(id));
    }
  }

  return all.filter((snapshot) => {
    if (filter.tenantId && snapshot.tenantId !== filter.tenantId) {
      return false;
    }
    if (!filter.minPriorityRank && !filter.maxPriorityRank) {
      return true;
    }

    const priority = topPriority(snapshot.priorities);
    if (filter.minPriorityRank && priority && priority.rank < filter.minPriorityRank) {
      return false;
    }
    if (filter.maxPriorityRank && priority && priority.rank > filter.maxPriorityRank) {
      return false;
    }
    return true;
  });
};

export const topPriority = (priorities: SignalPriority[]): SignalPriority | undefined => {
  if (priorities.length === 0) {
    return undefined;
  }
  return [...priorities].sort((left, right) => left.rank - right.rank)[0];
};

export const describePlans = (store: SignalStore): Array<{ id: string; score: number; planCount: number }> => {
  const plans = store.listPlans();
  const grouped = plans.reduce<Record<string, SignalPlan[]>>((acc, plan) => {
    acc[plan.tenantId] = [...(acc[plan.tenantId] ?? []), plan];
    return acc;
  }, {});

  return Object.entries(grouped).map(([tenantId, tenantPlans]) => {
    const score = tenantPlans.reduce((acc, plan) => acc + plan.score, 0);
    return { id: tenantId, score: Number((score / tenantPlans.length).toFixed(4)), planCount: tenantPlans.length };
  });
};
