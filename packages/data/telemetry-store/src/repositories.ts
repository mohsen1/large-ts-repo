import { InMemoryRepository } from '@data/repositories';
import { TelemetryEnvelope, TenantId, PolicyRule, RouteRule, IncidentRecord, AlertMatch, PolicyId, IncidentId } from '@domain/telemetry-models';
import { EnvelopeStore, PolicyField, PolicyCursor, RouteIndex, RepositoryBatch, RepositoryPageToken, TelemetryPolicyStore, IncidentStore } from './models';

type SortedRecord = Map<number, TelemetryEnvelope>;

export class InMemoryEnvelopeStore implements EnvelopeStore {
  private readonly records = new Map<string, SortedRecord>();

  async saveMany(envelopes: ReadonlyArray<TelemetryEnvelope>): Promise<void> {
    for (const envelope of envelopes) {
      const byTenant = this.records.get(envelope.sample.tenantId) ?? new Map<number, TelemetryEnvelope>();
      byTenant.set(envelope.createdAt, envelope);
      this.records.set(envelope.sample.tenantId, byTenant);
    }
  }

  async listByTenant(tenantId: TenantId, options: { filter?: { since?: number; until?: number }; limit?: number; cursor?: string }): Promise<RepositoryBatch<TelemetryEnvelope>> {
    const sorted = this.records.get(tenantId) ?? new Map<number, TelemetryEnvelope>();
    const entries = [...sorted.entries()]
      .filter(([time]) => options?.filter?.since == null || time >= (options.filter.since as number))
      .filter(([time]) => options?.filter?.until == null || time <= (options.filter.until as number))
      .sort(([left], [right]) => left - right)
      .map(([, value]) => value);
    const start = Number(options.cursor ?? 0);
    const limited = entries.slice(start, start + (options.limit ?? 200));
    const cursor = `${start + limited.length}` as RepositoryPageToken;
    return { items: limited, cursor };
  }

  async removeExpired(before: number): Promise<number> {
    let removed = 0;
    for (const [tenantId, byTenant] of this.records) {
      for (const [time, envelope] of byTenant) {
        if (time < before) {
          byTenant.delete(time);
          removed += 1;
        }
      }
      if (byTenant.size === 0) this.records.delete(tenantId);
    }
    return removed;
  }
}

export class PolicyStore extends InMemoryRepository<PolicyId, PolicyRule> implements TelemetryPolicyStore {
  private readonly routeRules = new Map<TenantId, RouteRule[]>();

  async save(entity: PolicyRule): Promise<void> {
    await super.save(entity);
  }

  async deleteById(id: PolicyId): Promise<void> {
    await super.deleteById(id);
    for (const rules of this.routeRules.values()) {
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        if (rules[index].id === id) rules.splice(index, 1);
      }
    }
  }

  async search(filter: PolicyCursor): Promise<RepositoryBatch<PolicyRule>> {
    const all = await this.all();
    const out = all.filter((policy) => {
      if (filter.filter.tenantId && policy.tenantId !== filter.filter.tenantId) return false;
      if (typeof filter.filter.enabled === 'boolean' && policy.enabled !== filter.filter.enabled) return false;
      return true;
    });
    return {
      items: filter.limit ? out.slice(0, filter.limit) : out,
      cursor: `${out.length}` as RepositoryPageToken,
    };
  }

  setRouteRules(tenantId: TenantId, rules: ReadonlyArray<RouteRule>): void {
    this.routeRules.set(tenantId, [...rules]);
  }

  getRouteRules(tenantId: TenantId): RouteRule[] {
    return [...(this.routeRules.get(tenantId) ?? [])];
  }
}

export class InMemoryIncidentStore implements IncidentStore {
  private readonly incidents = new Map<IncidentId, IncidentRecord>();

  async save(record: IncidentRecord): Promise<void> {
    this.incidents.set(record.id, record);
  }

  async list(tenantId: TenantId): Promise<IncidentRecord[]> {
    return [...this.incidents.values()].filter((record) => record.tenantId === tenantId);
  }

  async resolve(id: PolicyId, reason: string): Promise<boolean> {
    let changed = false;
    for (const record of this.incidents.values()) {
      if (record.matchedRule.id === id && !record.resolved) {
        record.resolved = true;
        changed = true;
      }
    }
    return changed;
  }
}

export class MatchRepository implements EnvelopeStore, IncidentStore {
  private readonly alerts: AlertMatch[] = [];
  constructor(private readonly incidents: InMemoryIncidentStore = new InMemoryIncidentStore()) {}

  async saveMany(envelopes: readonly TelemetryEnvelope[]): Promise<void> {
    return;
  }

  async listByTenant(): Promise<{
    items: readonly TelemetryEnvelope[];
    cursor: RepositoryPageToken;
  }> {
    return { items: [], cursor: '0' as RepositoryPageToken };
  }

  async removeExpired(before: number): Promise<number> {
    return before ? 0 : 0;
  }

  async list(tenantId: TenantId): Promise<IncidentRecord[]> {
    return this.incidents.list(tenantId);
  }

  async save(record: IncidentRecord): Promise<void> {
    return this.incidents.save(record);
  }

  async resolve(id: PolicyId, reason: string): Promise<boolean> {
    return this.incidents.resolve(id, reason);
  }
}
