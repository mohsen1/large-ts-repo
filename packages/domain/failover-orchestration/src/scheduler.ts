import { PlanSnapshot, StageWindow, StageGraph, StageId, PlanId } from './models';
import { NonEmptyArray } from '@shared/type-level';

export interface ScheduleConfig {
  jitterMinutes?: number;
  minGapMinutes?: number;
}

export interface StageSchedule {
  planId: PlanId;
  stages: Array<{
    stageId: StageId;
    startsAt: string;
    endsAt: string;
    prerequisites: StageId[];
    regions: string[];
  }>;
}

const normalizeDate = (value: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return Date.now();
  return parsed;
};

export const orderStages = (graph: NonEmptyArray<StageGraph>): StageGraph[] => {
  const outgoing = new Map<StageId, number>(
    graph.map((node) => [node.id, node.prerequisites.length]),
  );
  const byId = new Map<StageId, StageGraph>(graph.map((node) => [node.id, node]));
  const ordered: StageGraph[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph) {
      if ((outgoing.get(node.id) ?? 0) === 0) {
        outgoing.set(node.id, -1);
        ordered.push(node);
        for (const other of graph) {
          if (other.prerequisites.includes(node.id)) {
            const next = (outgoing.get(other.id) ?? 0) - 1;
            outgoing.set(other.id, Math.max(-1, next));
          }
        }
        changed = true;
      }
    }
  }

  return ordered;
};

const defaultWindows = (base: StageWindow): StageWindow[] => {
  const baseStart = normalizeDate(base.startsAt);
  const windows = [
    {
      startsAt: new Date(baseStart).toISOString(),
      durationMinutes: base.durationMinutes,
      regions: base.regions,
    },
  ];
  return windows;
};

export const expandWindows = (snapshot: Readonly<PlanSnapshot>, config: ScheduleConfig = {}): StageWindow[] => {
  const jitter = config.jitterMinutes ?? 0;
  const minGap = config.minGapMinutes ?? 2;
  const scheduled: StageWindow[] = [];

  let cursor = Date.parse(snapshot.plan.updatedAt);
  for (const stage of snapshot.plan.windows) {
    const windows = defaultWindows(stage);
    for (const window of windows) {
      const shifted = { ...window, startsAt: new Date(cursor).toISOString() };
      scheduled.push(shifted);
      cursor += (window.durationMinutes + minGap + jitter) * 60_000;
    }
  }

  return scheduled.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
};

export const buildSchedule = (
  snapshot: Readonly<PlanSnapshot>,
  graph: NonEmptyArray<StageGraph>,
  config?: ScheduleConfig,
): StageSchedule => {
  const ordered = orderStages(graph);
  const windows = expandWindows(snapshot, config);

  return {
    planId: snapshot.plan.id,
    stages: ordered.map((stage, index) => {
      const window = windows[index % windows.length];
      return {
        stageId: stage.id,
        startsAt: window.startsAt,
        endsAt: new Date(Date.parse(window.startsAt) + window.durationMinutes * 60_000).toISOString(),
        prerequisites: stage.prerequisites,
        regions: Object.keys(window.regions),
      };
    }),
  };
};
