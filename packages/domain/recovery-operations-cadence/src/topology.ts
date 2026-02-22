import { indexPlan, sortWindowsBySpan, toNumeric } from './utility';
import type { CadenceSlot, CadenceSlotId, CadenceWindow, CadenceRunPlan, CadencePlanCandidate, CadenceExecutionWindow } from './types';

export interface GraphEdge {
  readonly from: CadenceSlotId;
  readonly to: CadenceSlotId;
}

export interface PlanTopology {
  readonly order: readonly CadenceSlotId[];
  readonly edges: readonly GraphEdge[];
  readonly windows: readonly CadenceWindow[];
  readonly windowsBySlot: ReadonlyMap<CadenceSlotId, CadenceWindow>;
}

export interface TopologyValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly circularDependencies: readonly CadenceSlotId[];
}

const collectEdges = (slots: readonly CadenceSlot[]): readonly GraphEdge[] =>
  slots.flatMap((slot) => slot.requires.map((dependency) => ({ from: dependency, to: slot.id })));

const detectCycle = (source: Map<CadenceSlotId, CadenceSlotId[]>, start: CadenceSlotId): CadenceSlotId[] => {
  const seen = new Set<CadenceSlotId>();
  const path = new Set<CadenceSlotId>();
  const stack: CadenceSlotId[] = [];

  const walk = (node: CadenceSlotId): CadenceSlotId[] => {
    if (path.has(node)) {
      return [...path].slice([...path].indexOf(node));
    }

    if (!source.has(node) || seen.has(node)) {
      return [];
    }

    path.add(node);
    const edges = source.get(node) ?? [];

    for (const next of edges) {
      const found = walk(next);
      if (found.length > 0) {
        stack.push(...found);
        return found;
      }
    }

    path.delete(node);
    seen.add(node);
    return [];
  };

  return walk(start);
};

const validateWindowOrder = (windows: readonly CadenceWindow[]): string[] => {
  const ordered = sortWindowsBySpan(windows);
  const reasons: string[] = [];

  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const previousStart = Date.parse(previous.startsAt);
    const currentStart = Date.parse(current.startsAt);
    const currentEnds = Date.parse(current.endsAt);

    if (Number.isNaN(previousStart) || Number.isNaN(currentStart) || Number.isNaN(currentEnds)) {
      reasons.push(`Invalid timestamp in windows ${String(previous.id)} or ${String(current.id)}`);
      continue;
    }

    if (currentStart < previousStart) {
      reasons.push(`Window ${String(current.id)} starts before ${String(previous.id)}`);
    }

    if (currentStart >= currentEnds) {
      reasons.push(`Window ${String(current.id)} start is after end`);
    }
  }

  return reasons;
};

export const buildTopology = (candidate: CadencePlanCandidate): PlanTopology => {
  const edges = collectEdges(candidate.profile.slots);
  const windowBuckets = new Map<CadenceSlotId, CadenceWindow>();

  for (const slot of candidate.profile.slots) {
    const window = candidate.profile.windows.find((entry) => entry.id === slot.windowId);
    if (window) {
      windowBuckets.set(slot.id, window);
    }
  }

  const sortedWindows = sortWindowsBySpan(candidate.profile.windows);

  const index = indexPlan(candidate.profile.slots);

  const order = [] as CadenceSlotId[];
  const unresolved = new Set(index.bySlot.keys());

  while (unresolved.size > 0) {
    const ready = Array.from(unresolved).filter((slotId) => {
      const indegree = index.incoming.get(slotId) ?? 0;
      if (indegree !== 0) {
        return false;
      }
      const dependencies = index.outgoing.get(slotId) ?? [];
      return dependencies.every((dependency) => !unresolved.has(dependency));
    });

    if (ready.length === 0) {
      break;
    }

    for (const slotId of ready) {
      order.push(slotId);
      unresolved.delete(slotId);
      for (const outgoing of index.outgoing.get(slotId) ?? []) {
        const nextInDegree = (index.incoming.get(outgoing) ?? 0) - 1;
        if (nextInDegree > 0) {
          index.incoming.set(outgoing, nextInDegree);
        } else {
          index.incoming.delete(outgoing);
        }
      }
    }
  }

  if (order.length !== candidate.profile.slots.length) {
    const remaining = Array.from(unresolved);
    for (const slotId of remaining) {
      if (!order.includes(slotId)) {
        order.push(slotId);
      }
    }
  }

  return {
    order,
    edges,
    windows: sortedWindows,
    windowsBySlot: windowBuckets,
  };
};

export const validateTopology = (candidate: CadencePlanCandidate): TopologyValidation => {
  const windowsIssues = validateWindowOrder(candidate.profile.windows);
  const slots = candidate.profile.slots;
  const edges = collectEdges(slots);
  const edgesBySlot = new Map<CadenceSlotId, CadenceSlotId[]>();

  for (const slot of slots) {
    edgesBySlot.set(slot.id, [...slot.requires]);
  }

  const cycleWarnings = edgesBySlot.size > 0
    ? Array.from(edgesBySlot.keys()).flatMap((slotId) => detectCycle(edgesBySlot, slotId))
    : [];

  const missingWindow = slots.filter((slot) => !candidate.profile.windows.some((window) => window.id === slot.windowId)).map((slot) => slot.id);

  const errors = [...windowsIssues];
  for (const slot of slots) {
    if (slot.estimatedMinutes <= 0) {
      errors.push(`Slot ${String(slot.id)} has non-positive estimatedMinutes`);
    }
    if (slot.weight < 0 || slot.weight > 1) {
      errors.push(`Slot ${String(slot.id)} has invalid weight ${slot.weight}`);
    }
  }

  for (const slotId of missingWindow) {
    errors.push(`Slot ${String(slotId)} references missing window`);
  }

  if (cycleWarnings.length > 0) {
    const unique = Array.from(new Set(cycleWarnings));
    errors.push(`Detected dependency cycles: ${unique.join(', ')}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    circularDependencies: cycleWarnings,
  };
};

export const splitByExecutionWindow = (runPlan: CadenceRunPlan): readonly CadenceExecutionWindow[] => {
  const buckets = new Map<string, CadenceSlot[]>();
  for (const slot of runPlan.slots) {
    const key = String(slot.windowId);
    buckets.set(key, [...(buckets.get(key) ?? []), slot]);
  }

  return runPlan.windows
    .map((window, index) => {
      const slots = buckets.get(String(window.id)) ?? [];
      return {
        runId: runPlan.runId,
        window,
        slots,
        index,
        total: slots.length,
      };
    })
    .filter((item) => item.total > 0);
};

export const estimateWindowCapacity = (window: CadenceWindow): number => {
  const durationMinutes = toNumeric((Date.parse(window.endsAt) - Date.parse(window.startsAt)) / 60000, 0);
  if (durationMinutes <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(durationMinutes / Math.max(1, window.maxRetries)));
};
