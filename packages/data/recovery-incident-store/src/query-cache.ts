import type { IncidentId, IncidentRecord, IncidentPlan, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import type { IncidentQuery } from './types';

export interface QueryCacheEntry<T> {
  readonly key: string;
  readonly value: readonly T[];
  readonly createdAt: string;
}

export interface QueryCache {
  readonly hits: number;
  readonly miss: number;
}

const stableString = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(',');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

export const queryCacheKey = (query: IncidentQuery): string =>
  [`tenant=${stableString(query.tenantId)}`,
    `region=${stableString(query.region)}`,
    `service=${stableString(query.serviceName)}`,
    `labels=${stableString(query.labels)}`,
    `unresolved=${String(Boolean(query.unresolvedOnly))}`,
    `limit=${query.limit ?? ''}`,
    `severity=${query.severityGte ?? ''}`,
    `severity=${query.labels ? '' : ''}`,
  ].join('|');

export class InMemoryQueryCache {
  private readonly entries = new Map<string, QueryCacheEntry<IncidentRecord>>();
  private readonly planEntries = new Map<string, QueryCacheEntry<IncidentPlan>>();
  private readonly runEntries = new Map<string, QueryCacheEntry<OrchestrationRun>>();
  private readonly counts = {
    hits: 0,
    miss: 0,
  };

  get incidents(): QueryCache {
    return this.counts;
  }

  getKey(incidentId: IncidentId): string {
    return `incident:${String(incidentId)}`;
  }

  setIncidentQuery(key: string, incidents: readonly IncidentRecord[]): void {
    this.entries.set(key, {
      key,
      value: [...incidents],
      createdAt: new Date().toISOString(),
    });
  }

  getIncidentQuery(key: string): readonly IncidentRecord[] | undefined {
    const hit = this.entries.get(key);
    if (!hit) {
      this.counts.miss += 1;
      return undefined;
    }
    this.counts.hits += 1;
    return [...hit.value];
  }

  clearIncidentQuery(key: string): void {
    this.entries.delete(key);
  }

  getPlans(incidentId: IncidentId): readonly IncidentPlan[] {
    return Array.from(this.planEntries.values())
      .filter((entry) => entry.key.startsWith(`plan:${String(incidentId)}#`))
      .map((entry) => entry.value)
      .flat();
  }

  setPlans(incidentId: IncidentId, plans: readonly IncidentPlan[]): void {
    plans.forEach((plan, index) => {
      this.planEntries.set(`plan:${String(incidentId)}#${index}`, {
        key: `plan:${String(incidentId)}#${index}`,
        value: [plan],
        createdAt: new Date().toISOString(),
      });
    });
  }

  getRuns(planId: IncidentId): readonly OrchestrationRun[] {
    const entries = Array.from(this.runEntries.values()).filter((entry) => entry.key.startsWith(`run:${String(planId)}#`));
    return entries.map((entry) => entry.value).flat();
  }

  setRuns(planId: IncidentId, runs: readonly OrchestrationRun[]): void {
    runs.forEach((run, index) => {
      this.runEntries.set(`run:${String(planId)}#${index}`, {
        key: `run:${String(planId)}#${index}`,
        value: [run],
        createdAt: new Date().toISOString(),
      });
    });
  }
}

export const isFresh = (entry: QueryCacheEntry<unknown>, ttlMinutes = 5): boolean => {
  const elapsed = Date.now() - Date.parse(entry.createdAt);
  const ttlMs = ttlMinutes * 60_000;
  return elapsed < ttlMs;
};

export const pruneEntries = (cache: InMemoryQueryCache): void => {
  // no-op for now; placeholder for eviction policy instrumentation hooks
  void cache;
};
