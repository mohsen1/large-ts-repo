import type { IncidentRecord, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import type { IncidentStoreState } from './types';

export interface StoreHealthMetric {
  readonly timestamp: string;
  readonly incidents: number;
  readonly plans: number;
  readonly runs: number;
  readonly events: number;
  readonly runHealth: number;
  readonly resolvedRate: number;
}

export interface RunSlice {
  readonly done: number;
  readonly pending: number;
  readonly running: number;
  readonly failed: number;
}

const safePercent = (value: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  return Number((value / total).toFixed(4));
};

export const evaluateRunHealth = (runs: readonly OrchestrationRun[]): RunSlice => {
  const slice = {
    done: 0,
    pending: 0,
    running: 0,
    failed: 0,
  };

  for (const run of runs) {
    if (run.state === 'done') {
      slice.done += 1;
    } else if (run.state === 'running') {
      slice.running += 1;
    } else if (run.state === 'failed') {
      slice.failed += 1;
    } else {
      slice.pending += 1;
    }
  }

  return slice;
};

export const buildStoreHealth = (state: IncidentStoreState): StoreHealthMetric => {
  const resolved = state.incidents.filter((entry) => entry.incident.resolvedAt).length;
  const runs = state.runs.map((entry) => entry.run);
  const runSlice = evaluateRunHealth(runs);

  const done = runSlice.done + runSlice.pending + runSlice.running + runSlice.failed;
  const runHealth = done === 0
    ? 1
    : (runSlice.done + runSlice.pending) / done;

  return {
    timestamp: new Date().toISOString(),
    incidents: state.incidents.length,
    plans: state.plans.length,
    runs: state.runs.length,
    events: state.events.length,
    runHealth: Number(runHealth.toFixed(4)),
    resolvedRate: safePercent(resolved, state.incidents.length),
  };
};

export const buildSeverityDistribution = (incidents: readonly IncidentRecord[]): Readonly<Record<IncidentRecord['severity'], number>> => {
  const result: Record<IncidentRecord['severity'], number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    extreme: 0,
  };
  for (const incident of incidents) {
    result[incident.severity] += 1;
  }
  return result;
};

export interface AgeBucket {
  fresh: number;
  aging: number;
  stale: number;
}

export const buildIncidentAgeBuckets = (incidents: readonly IncidentRecord[]): AgeBucket => {
  const buckets = {
    fresh: 0,
    aging: 0,
    stale: 0,
  };
  const now = Date.now();

  for (const incident of incidents) {
    const ageMs = now - new Date(incident.detectedAt).getTime();
    if (Number.isNaN(ageMs)) {
      continue;
    }
    const ageMinutes = ageMs / 60_000;
    if (ageMinutes < 30) {
      buckets.fresh += 1;
    } else if (ageMinutes < 120) {
      buckets.aging += 1;
    } else {
      buckets.stale += 1;
    }
  }

  return buckets;
};
