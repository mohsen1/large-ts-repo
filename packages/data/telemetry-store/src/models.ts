import { Repository, Query } from '@data/repositories';
import { Brand } from '@shared/core';
import { PolicyRule, TelemetryEnvelope, TenantId, RouteId, PolicyId, IncidentRecord, TimestampMs } from '@domain/telemetry-models';

export type RepositoryPageToken = Brand<string, 'RepositoryPageToken'>;

export interface PolicyCursor extends Query<PolicyRule, { tenantId?: string; enabled?: boolean }> {}

export interface RepositoryBatch<T> {
  readonly items: T[];
  readonly cursor: RepositoryPageToken;
}

export interface EnvelopeStore {
  saveMany(envelopes: ReadonlyArray<TelemetryEnvelope>): Promise<void>;
  listByTenant(
    tenantId: TenantId,
    options: Query<TelemetryEnvelope, { since?: TimestampMs; until?: TimestampMs }>,
  ): Promise<RepositoryBatch<TelemetryEnvelope>>;
  removeExpired(before: number): Promise<number>;
}

export interface RouteIndex {
  tenantId: TenantId;
  routeId: RouteId;
}

export interface IncidentStore {
  save(record: IncidentRecord): Promise<void>;
  list(tenantId: TenantId): Promise<IncidentRecord[]>;
  resolve(id: PolicyId, reason: string): Promise<boolean>;
}

export interface TelemetryPolicyStore extends Repository<PolicyId, PolicyRule> {
  search(filter: PolicyCursor): Promise<RepositoryBatch<PolicyRule>>;
}

export type PolicyField = keyof Pick<PolicyRule, 'id' | 'tenantId' | 'name' | 'enabled' | 'severity' | 'signal'>;
export type PolicyPatch = Partial<Pick<PolicyRule, Exclude<keyof PolicyRule, 'id' | 'window'>>>;
