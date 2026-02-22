import {
  type IncidentRecord,
  type IncidentPlan,
  type OrchestrationRun,
  type IncidentId,
} from '@domain/recovery-incident-orchestration';
import {
  type IncidentPlanRecord,
  type IncidentStoreState,
  type IncidentQuery,
  type QueryResult,
  type IncidentRunRecord,
  type IncidentStoreEvent,
} from './types';
import { buildCreatedEvent, buildPlanEvent, runToEvent } from './events';
import { hydrateIncidentRecord, serializeIncidentRecord, serializePlan, serializeRun } from './adapters';
import { InMemoryQueryCache, queryCacheKey } from './query-cache';

export interface RepositoryConfig {
  readonly enableEvents: boolean;
  readonly maxPerTenant: number;
}

export interface IncidentCommandResult {
  readonly ok: boolean;
  readonly state: IncidentStoreState;
  readonly diagnostics: readonly string[];
}

const emit = (
  events: Map<string, IncidentStoreEvent[]>,
  incidentId: IncidentId,
  event: { readonly type: IncidentStoreEvent['type']; readonly payload: Record<string, unknown> },
): IncidentStoreEvent[] => {
  const key = String(incidentId);
  const payload: IncidentStoreEvent = {
    id: `${key}:${event.type}:${Date.now()}` as IncidentStoreEvent['id'],
    incidentId,
    type: event.type,
    payload: event.payload,
    emittedAt: new Date().toISOString(),
  };
  const current = events.get(key) ?? [];
  const next = [...current, payload];
  events.set(key, next);
  return next;
};

export class RecoveryIncidentRepository {
  private readonly incidents = new Map<string, IncidentRecord>();
  private readonly plans = new Map<string, IncidentPlanRecord[]>();
  private readonly runs = new Map<string, OrchestrationRun[]>();
  private readonly events = new Map<string, IncidentStoreEvent[]>();
  private readonly cache = new InMemoryQueryCache();
  private readonly settings: RepositoryConfig;

  constructor(settings: Partial<RepositoryConfig> = {}) {
    this.settings = {
      enableEvents: true,
      maxPerTenant: 100,
      ...settings,
    };
  }

  private key(incidentId: IncidentId): string {
    return String(incidentId);
  }

  private storeEvent(incidentId: IncidentId, event: Omit<IncidentStoreEvent, 'id' | 'incidentId' | 'emittedAt'>): void {
    if (!this.settings.enableEvents) {
      return;
    }
    const updated = emit(this.events, incidentId, {
      type: event.type,
      payload: event.payload,
    });
    this.events.set(this.key(incidentId), updated.slice(-100));
  }

  async upsertIncident(incident: IncidentRecord): Promise<IncidentCommandResult> {
    const key = this.key(incident.id);
    const prior = this.incidents.has(key);
    this.incidents.set(key, incident);
    serializeIncidentRecord(incident);

    const event = prior
      ? { type: 'updated' as const, payload: { id: key, title: incident.title, severity: incident.severity } }
      : buildCreatedEvent(incident);
    this.storeEvent(incident.id, event);

    const tenantKey = queryCacheKey({ tenantId: incident.scope.tenantId });
    const tenantIncidents = (await this.findIncidents({ tenantId: incident.scope.tenantId })).data;
    this.cache.setIncidentQuery(tenantKey, tenantIncidents);

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: [prior ? `updated:${key}` : `created:${key}`],
    };
  }

  async addPlan(plan: IncidentPlan): Promise<IncidentCommandResult> {
    const key = this.key(plan.incidentId);
    const current = this.plans.get(key) ?? [];
    const entry: IncidentPlanRecord = {
      id: plan.id,
      incidentId: plan.incidentId,
      label: plan.title,
      plan,
      createdAt: new Date().toISOString(),
    };

    this.plans.set(key, [...current, entry].slice(-this.settings.maxPerTenant));
    serializePlan(entry);

    this.storeEvent(plan.incidentId, buildPlanEvent(plan));

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: ['plan-added'],
    };
  }

  async addRuns(incidentId: IncidentId, run: OrchestrationRun): Promise<IncidentCommandResult> {
    const key = this.key(incidentId);
    const current = this.runs.get(key) ?? [];
    const record: IncidentRunRecord = {
      id: `${key}:${run.id}` as IncidentRunRecord['id'],
      runId: run.id,
      planId: run.planId,
      itemId: run.nodeId,
      run,
      status: (run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : 'running') as IncidentRunRecord['status'],
    };

    this.runs.set(key, [...current, record.run].slice(-this.settings.maxPerTenant));
    serializeRun(record);

    const event = runToEvent(run);
    this.storeEvent(incidentId, event);

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: ['run-added'],
    };
  }

  async findIncidents(query: IncidentQuery = {}): Promise<QueryResult<IncidentRecord>> {
    const key = queryCacheKey(query);
    const cached = this.cache.getIncidentQuery(key);
    if (cached) {
      return { total: cached.length, data: [...cached] };
    }

    const all = [...this.incidents.values()];
    const filtered = all.filter((incident) => {
      if (query.tenantId && incident.scope.tenantId !== query.tenantId) {
        return false;
      }
      if (query.region && incident.scope.region !== query.region) {
        return false;
      }
      if (query.serviceName && incident.scope.serviceName !== query.serviceName) {
        return false;
      }
      if (query.unresolvedOnly && Boolean(incident.resolvedAt)) {
        return false;
      }
      if (query.labels && query.labels.length > 0 && !query.labels.some((label) => incident.labels.includes(label))) {
        return false;
      }
      return true;
    });

    const ordered = [...filtered].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    const limit = query.limit ?? ordered.length;
    const data = ordered.slice(0, limit);
    this.cache.setIncidentQuery(key, data);

    return {
      total: filtered.length,
      data,
    };
  }

  async findPlans(incidentId: IncidentId): Promise<readonly IncidentPlanRecord[]> {
    return [...(this.plans.get(this.key(incidentId)) ?? [])];
  }

  async getRuns(incidentId: IncidentId): Promise<readonly OrchestrationRun[]> {
    const incidentPlans = await this.findPlans(incidentId);
    const planIds = new Set(incidentPlans.map((entry) => String(entry.id)));
    const incidentRuns = this.runs.get(this.key(incidentId)) ?? [];
    return incidentRuns.filter((run) => planIds.has(String(run.planId)));
  }

  async importRaw(serialized: string[]): Promise<IncidentCommandResult> {
    const hydrated = serialized.map((entry) => hydrateIncidentRecord(JSON.parse(entry) as any));
    for (const incident of hydrated) {
      await this.upsertIncident(incident);
    }

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: [`imported:${hydrated.length}`],
    };
  }

  snapshot(): IncidentStoreState {
    const plans = [...this.plans.values()].flat();
    const runRecords: IncidentRunRecord[] = [];

    for (const [incidentId, planRuns] of this.runs.entries()) {
      const entries = planRuns.map((run) => ({
        id: `${incidentId}:${run.id}`,
        runId: run.id,
        planId: run.planId,
        itemId: run.nodeId,
        run,
        status: (run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : 'running') as IncidentRunRecord['status'],
      }));
      runRecords.push(...entries);
    }

    const events = [...this.events.values()].flat();

    return {
      incidents: [...this.incidents.values()].map((incident) => ({
        id: incident.id,
        version: 1,
        label: incident.title,
        incident,
      })),
      plans,
      runs: runRecords,
      events,
    };
  }
}
