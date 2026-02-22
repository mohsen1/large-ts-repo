import type {
  IncidentId,
  IncidentRecord,
  IncidentPlan,
  OrchestrationRun,
  IncidentEvent,
  WorkItemId,
} from './types';

export interface IncidentTimelinePoint {
  readonly at: string;
  readonly incidentId: IncidentId;
  readonly label: string;
  readonly value: number;
  readonly tags: readonly string[];
}

export interface IncidentReplayState {
  readonly incidentId: IncidentId;
  readonly incidents: readonly IncidentRecord[];
  readonly plans: readonly IncidentPlan[];
  readonly runs: readonly OrchestrationRun[];
  readonly events: readonly IncidentEvent[];
}

export interface HistoryAggregate {
  readonly incidentId: IncidentId;
  readonly labelCount: number;
  readonly planCount: number;
  readonly runCount: number;
  readonly completedRunCount: number;
  readonly eventCount: number;
  readonly latestUpdatedAt: string;
  readonly signalTrend: readonly IncidentTimelinePoint[];
}

export interface HistorySnapshot {
  readonly at: string;
  readonly type: 'incident' | 'plan' | 'run' | 'event';
  readonly entityId: string;
  readonly payload: Record<string, unknown>;
}

export interface IncidentPlanRecord {
  readonly id: IncidentId;
  readonly incidentId: IncidentId;
  readonly label: string;
  readonly plan: IncidentPlan;
  readonly createdAt: string;
}

interface IncidentStoreEvent {
  readonly incidentId: IncidentId;
  readonly type: IncidentEvent['type'];
  readonly payload: Record<string, unknown>;
  readonly emittedAt: string;
}

export interface IncidentStoreState {
  readonly incidents: readonly { id: IncidentId; version: number; label: string; incident: IncidentRecord }[];
  readonly plans: readonly IncidentPlanRecord[];
  readonly runs: readonly {
    readonly id: string;
    readonly runId: string;
    readonly planId: IncidentPlan['id'];
    readonly itemId: WorkItemId;
    readonly run: OrchestrationRun;
    readonly status: 'queued' | 'running' | 'done' | 'failed';
  }[];
  readonly events: readonly IncidentStoreEvent[];
}

const safeDate = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildIncidentTimelinePoint = (incident: IncidentRecord, index: number): IncidentTimelinePoint => ({
  at: incident.detectedAt,
  incidentId: incident.id,
  label: `snapshot:${index + 1}`,
  value: incident.signals.reduce((sum, signal) => sum + Math.max(0, signal.value / Math.max(1, signal.threshold)), 0),
  tags: incident.labels,
});

const toSignalTimeline = (incident: IncidentRecord): readonly IncidentTimelinePoint[] => {
  const points = incident.snapshots
    .flatMap((snapshot, index) => {
      if (snapshot.indicators.length === 0) {
        return [];
      }
      return [{
        at: snapshot.scope.clusterId,
        incidentId: incident.id,
        label: `snapshot:${index + 1}`,
        value: snapshot.indicators.reduce((sum, indicator) => sum + indicator.value, 0) / Math.max(1, snapshot.indicators.length),
        tags: [snapshot.scope.serviceName ?? 'service', snapshot.scope.region],
      }];
    });

  return points.length > 0 ? points : [buildIncidentTimelinePoint(incident, 0)];
};

const scoreRuns = (runs: readonly OrchestrationRun[]): { done: number; running: number; failed: number; queued: number } => {
  const result = {
    done: 0,
    running: 0,
    failed: 0,
    queued: 0,
  };

  for (const run of runs) {
    if (run.state === 'done') {
      result.done += 1;
    } else if (run.state === 'running') {
      result.running += 1;
    } else if (run.state === 'failed') {
      result.failed += 1;
    } else {
      result.queued += 1;
    }
  }

  return result;
};

export const projectHistory = (input: Readonly<{
  incident?: IncidentRecord;
  plans: readonly IncidentPlanRecord[];
  events: readonly IncidentStoreEvent[];
  runs: readonly OrchestrationRun[];
}>): IncidentReplayState => {
  const incident = input.incident;
  if (!incident) {
    return {
      incidentId: '' as IncidentId,
      incidents: [],
      plans: [],
      runs: input.runs,
      events: input.events.map((event) => ({
        id: `${event.incidentId}:${event.type}:${event.emittedAt}` as IncidentEvent['id'],
        incidentId: event.incidentId,
        type: event.type,
        details: event.payload,
        createdAt: event.emittedAt,
      })),
    };
  }

  const plans = input.plans
    .filter((entry) => entry.incidentId === incident.id)
    .map((entry) => entry.plan);

  const planIds = new Set(plans.map((plan) => String(plan.id)));

  return {
    incidentId: incident.id,
    incidents: [incident],
    plans,
    runs: input.runs.filter((run) => planIds.has(String(run.planId))),
    events: input.events
      .filter((event) => event.incidentId === incident.id)
      .map((event) => ({
        id: `${event.incidentId}:${event.type}:${event.emittedAt}` as IncidentEvent['id'],
        incidentId: event.incidentId,
        type: event.type,
        details: event.payload,
        createdAt: event.emittedAt,
      })),
  };
};

export const buildAggregate = (incidentId: IncidentId, state: IncidentStoreState): HistoryAggregate => {
  const snapshot = state.incidents.find((entry) => entry.id === incidentId);
  if (!snapshot) {
    return {
      incidentId,
      labelCount: 0,
      planCount: 0,
      runCount: 0,
      completedRunCount: 0,
      eventCount: 0,
      latestUpdatedAt: new Date(0).toISOString(),
      signalTrend: [],
    };
  }

  const plans = state.plans.filter((entry) => entry.incidentId === incidentId);
  const planIds = new Set(plans.map((entry) => String(entry.id)));
  const runs = state.runs.filter((entry) => planIds.has(String(entry.planId)));
  const events = state.events.filter((entry) => entry.incidentId === incidentId);
  const { done } = scoreRuns(runs.map((entry) => entry.run));
  const timeline = toSignalTimeline(snapshot.incident);

  return {
    incidentId,
    labelCount: snapshot.incident.labels.length,
    planCount: plans.length,
    runCount: runs.length,
    completedRunCount: done,
    eventCount: events.length,
    latestUpdatedAt: runs.length > 0 ? runs[runs.length - 1].run.startedAt : snapshot.incident.detectedAt,
    signalTrend: timeline,
  };
};

export const buildHistorySnapshot = (replay: IncidentReplayState): readonly HistorySnapshot[] => {
  const incidents = replay.incidents.map((incident, index) => ({
    at: incident.detectedAt,
    type: 'incident' as const,
    entityId: String(replay.incidentId),
    payload: {
      index,
      score: incident.signals.length,
      serviceName: incident.scope.serviceName,
    },
  }));

  const plans = replay.plans.map((plan) => ({
    at: plan.route.createdAt,
    type: 'plan' as const,
    entityId: String(plan.id),
    payload: {
      incidentId: String(plan.incidentId),
      nodeCount: plan.route.nodes.length,
      riskScore: plan.riskScore,
      approved: plan.approved,
    },
  }));

  const runs = replay.runs.map((run) => ({
    at: run.startedAt,
    type: 'run' as const,
    entityId: run.id,
    payload: {
      planId: run.planId,
      state: run.state,
      nodeId: run.nodeId,
    },
  }));

  const snapshots = [...incidents, ...plans, ...runs];
  snapshots.sort((left, right) => safeDate(left.at) - safeDate(right.at));
  return snapshots;
};

export const foldTimeline = (points: readonly IncidentTimelinePoint[]): number => {
  return points.reduce((acc, point) => acc + point.value, 0);
};

export const splitByWorkItem = (runs: readonly OrchestrationRun[], limit: number): Map<WorkItemId, OrchestrationRun[]> => {
  const buckets = new Map<WorkItemId, OrchestrationRun[]>();
  for (const run of runs) {
    const existing = buckets.get(run.nodeId) ?? [];
    existing.push(run);
    buckets.set(run.nodeId, existing);
  }

  const sliced = new Map<WorkItemId, OrchestrationRun[]>();
  for (const [key, values] of buckets.entries()) {
    sliced.set(key, values.slice(-Math.max(1, limit)));
  }

  return sliced;
};

export const latestHealthSignal = (points: readonly IncidentTimelinePoint[]): IncidentTimelinePoint | undefined => {
  const ordered = [...points].sort((left, right) => safeDate(left.at) - safeDate(right.at));
  return ordered.at(-1);
};
