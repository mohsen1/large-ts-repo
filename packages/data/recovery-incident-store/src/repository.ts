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
} from './types';
import { buildCreatedEvent, buildPlanEvent, runToEvent, toBusEvent } from './events';
import { hydrateIncidentRecord, serializeIncidentRecord, serializePlan, serializeRun } from './adapters';

export interface RepositoryConfig {
  readonly enableEvents: boolean;
  readonly maxPerTenant: number;
}

export interface IncidentCommandResult {
  readonly ok: boolean;
  readonly state: IncidentStoreState;
  readonly diagnostics: readonly string[];
}

export class RecoveryIncidentRepository {
  private readonly incidents = new Map<string, IncidentRecord>();
  private readonly plans = new Map<string, IncidentPlanRecord[]>();
  private readonly runs = new Map<string, OrchestrationRun[]>();
  private readonly events: { [incidentId: string]: ReturnType<typeof toBusEvent>[] } = {};

  private readonly settings: RepositoryConfig;

  constructor(settings: RepositoryConfig = { enableEvents: true, maxPerTenant: 100 }) {
    this.settings = settings;
  }

  private key(incidentId: IncidentId): string {
    return String(incidentId);
  }

  async upsertIncident(incident: IncidentRecord): Promise<IncidentCommandResult> {
    const key = this.key(incident.id);
    const isNew = !this.incidents.has(key);
    this.incidents.set(key, incident);
    serializeIncidentRecord(incident);

    if (this.settings.enableEvents) {
      const event = toBusEvent(isNew ? buildCreatedEvent(incident) : {
        ...buildCreatedEvent(incident),
        type: 'updated',
      });
      this.events[key] = [...(this.events[key] ?? []), event];
    }

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: [isNew ? `created ${key}` : `updated ${key}`],
    };
  }

  async addPlan(plan: IncidentPlan): Promise<IncidentCommandResult> {
    const key = this.key(plan.incidentId);
    const prior = this.plans.get(key) ?? [];
    const record: IncidentPlanRecord = {
      id: plan.id,
      incidentId: plan.incidentId,
      label: plan.title,
      plan,
      createdAt: new Date().toISOString(),
    };
    serializePlan(record);
    const next = [...prior, record].slice(-this.settings.maxPerTenant);
    this.plans.set(key, next);

    if (this.settings.enableEvents) {
      this.events[key] = [...(this.events[key] ?? []), toBusEvent(buildPlanEvent(plan))];
    }

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: ['plan-added'],
    };
  }

  async addRuns(incidentId: IncidentId, run: OrchestrationRun): Promise<IncidentCommandResult> {
    const key = this.key(incidentId);
    const prior = this.runs.get(key) ?? [];
    const entry: IncidentRunRecord = {
      id: `${key}:${run.id}`,
      runId: run.id,
      planId: run.planId,
      itemId: run.nodeId,
      run,
      status: run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : 'running',
    };
    serializeRun(entry);
    this.runs.set(key, [...prior, run].slice(-this.settings.maxPerTenant));

    if (this.settings.enableEvents) {
      this.events[key] = [...(this.events[key] ?? []), toBusEvent(runToEvent(run))];
    }

    return {
      ok: true,
      state: this.snapshot(),
      diagnostics: ['run-added'],
    };
  }

  async findIncidents(query: IncidentQuery = {}): Promise<QueryResult<IncidentRecord>> {
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

    const limit = query.limit ?? filtered.length;
    return {
      total: filtered.length,
      data: filtered.slice(0, limit),
    };
  }

  async findPlans(incidentId: IncidentId): Promise<readonly IncidentPlanRecord[]> {
    return this.plans.get(this.key(incidentId)) ?? [];
  }

  async getRuns(incidentId: IncidentId): Promise<readonly OrchestrationRun[]> {
    return this.runs.get(this.key(incidentId)) ?? [];
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
    const incidents = [...this.incidents.entries()].map(([id, incident]) => ({
      id: this.key(id as IncidentId) as IncidentId,
      version: 1,
      label: incident.title,
      incident,
    }));
    const planRecords = [...this.plans.values()].flat();
    const runRecords = [...this.runs.entries()].flatMap(([incidentId, runList]) =>
      runList.map((run, index) => ({
        id: `${incidentId}-run-${index}`,
        runId: run.id,
        planId: run.planId,
        itemId: run.nodeId,
        run,
        status: (run.state === 'done' ? 'done' : run.state === 'failed' ? 'failed' : 'running') as 'running' | 'done' | 'failed' | 'queued',
      }))
    );
    const eventRecords = [...Object.entries(this.events)].flatMap(([incidentId, events]) =>
      events.map((event) => ({
        id: `${incidentId}-${event.type}-${event.payload.runId ?? event.type}`,
        incidentId: incidentId as IncidentId,
        type: event.type,
        payload: event.payload,
        emittedAt: new Date().toISOString(),
      }))
    );

    return {
      incidents,
      plans: planRecords,
      runs: runRecords,
      events: eventRecords,
    };
  }
}
