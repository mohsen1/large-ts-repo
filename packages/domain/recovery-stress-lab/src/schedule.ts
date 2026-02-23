import { normalizeLimit } from '@shared/core';
import { CommandRunbook, ReadinessWindow, SeverityBand, WorkloadId, WorkloadTopology, WorkloadTopologyEdge } from './models';

export interface TimeWindow {
  startMinute: number;
  endMinute: number;
  dayIndex: number;
}

export interface TimelineEntry {
  readonly runbookId: string;
  readonly window: TimeWindow;
  readonly workloadIds: readonly WorkloadId[];
}

export const DAY_MINUTES = 1440;

export const asMinutes = (isoDate: string): number => {
  const date = new Date(isoDate);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

export const inWindow = (timeMinute: number, startMinute: number, endMinute: number): boolean => {
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) {
    return timeMinute >= startMinute && timeMinute <= endMinute;
  }
  return timeMinute >= startMinute || timeMinute <= endMinute;
};

export const buildReadinessWindows = (runbook: CommandRunbook, band: SeverityBand): ReadonlyArray<ReadinessWindow> => {
  const windows: ReadinessWindow[] = [];
  const windowCount = band === 'critical' ? 4 : band === 'high' ? 3 : band === 'medium' ? 2 : 1;
  const cadence = runbook.cadence;
  const phaseSequence: readonly ['observe', 'isolate', 'migrate', 'verify', 'restore', 'standdown'] =
    ['observe', 'isolate', 'migrate', 'verify', 'restore', 'standdown'];

  for (let i = 0; i < windowCount; i += 1) {
    const shift = i * 45;
    const start = (cadence.windowStartMinute + shift) % DAY_MINUTES;
    const end = (start + cadence.windowEndMinute + shift / 2) % DAY_MINUTES;
    const base = (cadence.weekday + i) % 7;

    windows.push({
      runbookId: runbook.id,
      startAt: new Date(Date.UTC(2026, 0, 1 + base, Math.floor(start / 60), start % 60)).toISOString(),
      endAt: new Date(Date.UTC(2026, 0, 1 + base, Math.floor(end / 60), end % 60)).toISOString(),
      phaseOrder: phaseSequence.slice(0, windowCount + 1),
    });
  }

  return windows;
};

const overlaps = (left: TimeWindow, right: TimeWindow): boolean => {
  if (left.startMinute <= left.endMinute && right.startMinute <= right.endMinute) {
    return left.startMinute < right.endMinute && right.startMinute < left.endMinute;
  }
  const leftRange = [
    { start: left.startMinute, end: DAY_MINUTES },
    { start: 0, end: left.endMinute },
  ];
  const rightRange = [
    { start: right.startMinute, end: DAY_MINUTES },
    { start: 0, end: right.endMinute },
  ];

  return leftRange.some((a) => rightRange.some((b) => a.start < b.end && b.start < a.end));
};

export const mergeWindows = (left: readonly TimeWindow[], right: readonly TimeWindow[]): readonly TimeWindow[] => {
  const all = [...left, ...right]
    .sort((a, b) => (a.dayIndex - b.dayIndex) * DAY_MINUTES + a.startMinute - b.startMinute);

  const merged: TimeWindow[] = [];
  for (const candidate of all) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...candidate });
      continue;
    }
    if (last.dayIndex === candidate.dayIndex && overlaps(last, candidate)) {
      merged[merged.length - 1] = {
        ...last,
        endMinute: Math.max(last.endMinute, candidate.endMinute),
      };
      continue;
    }
    merged.push({ ...candidate });
  }

  return merged;
};

export const topologyTraversalOrder = (topology: WorkloadTopology): readonly WorkloadId[] => {
  const incoming = new Map<string, number>();
  const nodes = new Set<string>();

  for (const node of topology.nodes) {
    incoming.set(node.id, 0);
    nodes.add(node.id);
  }

  for (const edge of topology.edges) {
    if (nodes.has(edge.to) && nodes.has(edge.from)) {
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }
  }

  const ready = [...incoming.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  const output: WorkloadId[] = [];
  const adjacency = new Map<string, WorkloadTopologyEdge[]>();

  for (const edge of topology.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
  }

  const queue = [...ready];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || output.includes(next as WorkloadId)) continue;
    output.push(next as WorkloadId);
    const edges = adjacency.get(next) ?? [];
    for (const edge of edges) {
      const count = (incoming.get(edge.to) ?? 0) - 1;
      incoming.set(edge.to, count);
      if (count === 0) queue.push(edge.to);
    }
  }

  for (const [id, count] of incoming) {
    if (count > 0 && !output.includes(id as WorkloadId)) {
      output.push(id as WorkloadId);
    }
  }

  return output;
};

export const scheduleCoverageScore = (entries: readonly TimelineEntry[], minuteBudget: number): number => {
  const total = normalizeLimit(minuteBudget);
  const used = entries.reduce((carry, entry) => {
    const width = entry.window.endMinute - entry.window.startMinute;
    const span = width <= 0 ? (DAY_MINUTES - entry.window.startMinute) + entry.window.endMinute : width;
    return carry + span;
  }, 0);
  return total === 0 ? 0 : Math.min(1, used / total);
};

export const timelineDigest = (entries: readonly TimelineEntry[]): ReadonlyArray<Readonly<{ runbookId: string; loads: number }>> => {
  return entries.map((entry) => ({ runbookId: entry.runbookId, loads: entry.workloadIds.length }));
};
