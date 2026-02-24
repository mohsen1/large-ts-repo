import type {
  CadenceSlot,
  CadenceWindow,
  CadencePlanCandidate,
  CadenceRunPlan,
  CadenceWindowId,
  CadenceSlotId,
  CadenceExecutionWindow,
} from './types';
import type { NonEmptyArray } from '@shared/type-level';

export type BucketByKey<T extends { readonly [key: string]: unknown }, K extends keyof T & string> =
  Record<string, T[]> & Record<T[K] & string, T[]>;

export type OrderedWindow = CadenceWindow & { readonly position: number };

export type PlanPartition = {
  readonly windows: readonly CadenceWindow[];
  readonly slots: readonly CadenceSlot[];
};

export interface CadenceIndex {
  readonly bySlot: ReadonlyMap<CadenceSlotId, CadenceSlot>;
  readonly byWindow: ReadonlyMap<CadenceWindowId, CadenceWindow>;
  readonly outgoing: Map<CadenceSlotId, CadenceSlotId[]>;
  readonly incoming: Map<CadenceSlotId, number>;
}

export const toNumeric = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

export const asWindowKey = (window: CadenceWindow): string => `${window.id}:${window.title}`;

export const calculateSignalDensity = (signals: readonly CadenceSlot[]): number => {
  if (signals.length === 0) {
    return 0;
  }

  const sourceCount = new Map<string, number>();
  for (const signal of signals) {
    for (const tag of signal.tags) {
      sourceCount.set(tag, (sourceCount.get(tag) ?? 0) + 1);
    }
  }

  if (sourceCount.size === 0) {
    return 0;
  }

  const total = signals.length;
  let maxDensity = 0;
  for (const count of sourceCount.values()) {
    maxDensity = Math.max(maxDensity, count / total);
  }

  return maxDensity;
};

export const bucketByWindow = <T extends { readonly windowId: CadenceWindowId }>(items: readonly T[]): Map<CadenceWindowId, T[]> => {
  const buckets = new Map<CadenceWindowId, T[]>();
  for (const item of items) {
    const current = buckets.get(item.windowId) ?? [];
    buckets.set(item.windowId, [...current, item]);
  }
  return buckets;
};

export const indexPlan = (slots: readonly CadenceSlot[]): CadenceIndex => {
  const bySlot = new Map<CadenceSlotId, CadenceSlot>();
  const outgoing = new Map<CadenceSlotId, CadenceSlotId[]>();
  const incoming = new Map<CadenceSlotId, number>();

  for (const slot of slots) {
    bySlot.set(slot.id, slot);
    outgoing.set(slot.id, [...slot.requires]);
    for (const dependency of slot.requires) {
      incoming.set(dependency, (incoming.get(dependency) ?? 0) + 1);
    }
  }

  return {
    bySlot,
    byWindow: new Map(),
    outgoing,
    incoming,
  };
};

export const sortWindowsBySpan = (windows: readonly CadenceWindow[]): readonly OrderedWindow[] => {
  const enriched = windows
    .map((window, index) => ({
      ...window,
      position: index,
    }))
    .sort((left, right) => {
      const leftStart = Date.parse(left.startsAt);
      const rightStart = Date.parse(right.startsAt);
      if (leftStart === rightStart) {
        return left.position - right.position;
      }
      return leftStart - rightStart;
    });

  return enriched;
};

export const toPartition = (candidate: CadencePlanCandidate): PlanPartition => {
  const windowsById = new Set<CadenceWindowId>(candidate.profile.windows.map((window) => window.id));
  const slots = candidate.profile.slots;
  const attachedSlots = slots.filter((slot) => windowsById.has(slot.windowId));

  return {
    windows: candidate.profile.windows,
    slots: attachedSlots,
  };
};

export const calculateWindowCoverage = (partition: PlanPartition): number => {
  const windowCount = Math.max(1, partition.windows.length);
  const coveredWindows = new Set<CadenceWindowId>(partition.slots.map((slot) => slot.windowId)).size;
  return Number((coveredWindows / windowCount).toFixed(3));
};

export const calculateConcurrencyPeak = (slots: readonly CadenceSlot[]): number => {
  const perWindow = bucketByWindow(slots);
  let peak = 0;

  for (const grouped of perWindow.values()) {
    peak = Math.max(peak, grouped.length);
  }

  return peak;
};

export const estimateAverageDuration = (slots: readonly CadenceSlot[]): number => {
  if (slots.length === 0) {
    return 0;
  }

  const total = slots.reduce((acc, slot) => acc + slot.estimatedMinutes, 0);
  return Number((total / slots.length).toFixed(2));
};

export const rankByPriority = (candidateA: CadencePlanCandidate, candidateB: CadencePlanCandidate): number => {
  const priorityRank: Record<CadencePlanCandidate['profile']['priority'], number> = {
    low: 0,
    normal: 1,
    high: 2,
    critical: 3,
  };

  const rankDiff = priorityRank[candidateB.profile.priority] - priorityRank[candidateA.profile.priority];
  if (rankDiff !== 0) {
    return rankDiff;
  }

  if (candidateA.revision !== candidateB.revision) {
    return candidateB.revision - candidateA.revision;
  }

  return candidateB.profile.slots.length - candidateA.profile.slots.length;
};

export const dedupeSlots = (slots: readonly CadenceSlot[]): readonly CadenceSlot[] => {
  const unique = new Map<CadenceSlotId, CadenceSlot>();

  for (const slot of slots) {
    const existing = unique.get(slot.id);
    if (!existing) {
      unique.set(slot.id, slot);
      continue;
    }

    const best = existing.estimatedMinutes <= slot.estimatedMinutes ? existing : slot;
    unique.set(slot.id, best);
  }

  return Array.from(unique.values());
};

export const splitWindows = (plan: CadenceRunPlan): readonly CadenceExecutionWindow[] => {
  const windows = bucketByWindow(plan.slots);
  return plan.windows.flatMap((window, index) => {
    const slots = windows.get(window.id) ?? [];
    return slots.length === 0
      ? []
      : [
          {
            runId: plan.runId,
            window,
            slots,
            index,
            total: slots.length,
          },
        ];
  });
};

export const assertNonEmpty = <T>(items: readonly T[]): items is NonEmptyArray<T> => {
  return items.length > 0;
};

export const calculateCoverage = (windows: readonly CadenceWindow[], slots: readonly CadenceSlot[]): number => {
  return Number(Math.min(1, calculateWindowCoverage({ windows, slots })).toFixed(3));
};
