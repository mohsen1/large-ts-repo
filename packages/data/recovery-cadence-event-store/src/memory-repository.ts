import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  CadenceConstraint,
  CadenceExecutionEvent,
  CadenceIntent,
  CadencePlan,
  CadencePlanSnapshot,
  CadenceWindow,
} from '@domain/recovery-cadence-orchestration';
import type { CadenceEventFilters, CadenceQuery, CadenceStoreRecord, CadenceStorePage } from './types';
import type { CadenceRepository } from './repository';
import { fallbackPlan } from './fixtures';
import { buildStoreRecordStats } from './insights';

export class CadenceMemoryRepository implements CadenceRepository {
  private readonly records = new Map<CadencePlan['id'], CadenceStoreRecord>([
    [fallbackPlan.id, {
      plan: fallbackPlan,
      windows: [],
      intents: [],
      constraints: [],
      events: [],
      snapshots: [],
      lastUpdatedAt: fallbackPlan.updatedAt,
    }],
  ]);

  async listPlans(query: CadenceQuery = {}): Promise<Result<CadenceStorePage<CadencePlan>, Error>> {
    const plans = [...this.records.values()].map((record) => record.plan);
    const filtered = plans.filter((plan) => {
      if (query.owner && plan.owner !== query.owner) return false;
      if (query.organizationId && plan.organizationId !== query.organizationId) return false;
      if (query.status && plan.status !== query.status) return false;
      if (query.channel) {
        const exists = [...this.records.values()].some((record) =>
          record.windows.some((window) => window.channel === query.channel),
        );
        if (!exists) return false;
      }
      return true;
    });

    const limit = Math.max(1, Math.min(200, query.limit ?? 50));
    const offset = Math.max(0, query.offset ?? 0);
    const sorted = [...filtered].sort((a, b) => {
      if (query.sortBy === 'owner') return a.owner.localeCompare(b.owner);
      if (query.sortBy === 'updatedAt') return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });

    if (query.sortOrder === 'desc') {
      sorted.reverse();
    }

    const slice = sorted.slice(offset, offset + limit);
    return ok({
      data: slice,
      total: filtered.length,
      offset,
      limit,
    });
  }

  async getPlan(planId: CadencePlan['id']): Promise<Result<CadenceStoreRecord | undefined, Error>> {
    return ok(this.records.get(planId));
  }

  async savePlan(plan: CadencePlan): Promise<Result<CadencePlan, Error>> {
    const existing = this.records.get(plan.id);
    this.records.set(plan.id, {
      ...(existing ?? {
        windows: [],
        intents: [],
        constraints: [],
        events: [],
        snapshots: [],
      }),
      plan,
      lastUpdatedAt: new Date().toISOString(),
    });
    return ok(plan);
  }

  async saveWindow(window: CadenceWindow): Promise<Result<CadenceWindow, Error>> {
    const record = this.records.get(window.planId);
    if (!record) {
      return fail(new Error(`plan-not-found:${window.planId}`));
    }
    const withoutWindow = record.windows.filter((candidate) => candidate.id !== window.id);
    this.records.set(window.planId, {
      ...record,
      windows: [...withoutWindow, window],
      lastUpdatedAt: new Date().toISOString(),
    });
    return ok(window);
  }

  async saveIntent(intent: CadenceIntent): Promise<Result<CadenceIntent, Error>> {
    const record = this.records.get(intent.planId);
    if (!record) {
      return fail(new Error(`plan-not-found:${intent.planId}`));
    }
    const filtered = record.intents.filter((candidate) => candidate.id !== intent.id);
    this.records.set(intent.planId, {
      ...record,
      intents: [...filtered, intent],
      lastUpdatedAt: new Date().toISOString(),
    });
    return ok(intent);
  }

  async saveConstraint(constraint: CadenceConstraint): Promise<Result<CadenceConstraint, Error>> {
    const record = this.records.get(constraint.planId);
    if (!record) {
      return fail(new Error(`plan-not-found:${constraint.planId}`));
    }
    const filtered = record.constraints.filter((candidate) => candidate.id !== constraint.id);
    this.records.set(constraint.planId, {
      ...record,
      constraints: [...filtered, constraint],
      lastUpdatedAt: new Date().toISOString(),
    });
    return ok(constraint);
  }

  async appendEvent(event: CadenceExecutionEvent): Promise<Result<CadenceExecutionEvent, Error>> {
    const record = this.records.get(event.planId);
    if (!record) {
      return fail(new Error(`plan-not-found:${event.planId}`));
    }
    this.records.set(event.planId, {
      ...record,
      events: [...record.events, event],
      lastUpdatedAt: new Date().toISOString(),
    });
    return ok(event);
  }

  async appendSnapshot(snapshot: CadencePlanSnapshot): Promise<Result<CadencePlanSnapshot, Error>> {
    const record = this.records.get(snapshot.planId);
    if (!record) {
      return fail(new Error(`plan-not-found:${snapshot.planId}`));
    }
    this.records.set(snapshot.planId, {
      ...record,
      snapshots: [...record.snapshots, snapshot],
      lastUpdatedAt: new Date().toISOString(),
    });
    return ok(snapshot);
  }

  async getEvents(filters: CadenceEventFilters = {}): Promise<Result<CadenceExecutionEvent[], Error>> {
    const events = [...this.records.values()].flatMap((record) => record.events).filter((event) => {
      if (filters.planId && event.planId !== filters.planId) return false;
      if (filters.windowId && event.windowId !== filters.windowId) return false;
      if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes(event.kind)) return false;
      if (filters.since && Date.parse(event.timestamp) < Date.parse(filters.since)) return false;
      if (filters.until && Date.parse(event.timestamp) > Date.parse(filters.until)) return false;
      return true;
    });

    return ok(events);
  }

  async clear(): Promise<Result<void, Error>> {
    this.records.clear();
    this.records.set(fallbackPlan.id, {
      plan: fallbackPlan,
      windows: [],
      intents: [],
      constraints: [],
      events: [],
      snapshots: [],
      lastUpdatedAt: new Date().toISOString(),
    });
    const stats = buildStoreRecordStats([...this.records.values()]);
    void stats;
    return ok(undefined);
  }
}
