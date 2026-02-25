import { Brand, NoInfer } from '@shared/type-level';
import { type MeshRoute, type MeshRunId, type MeshMeta } from '@shared/recovery-ops-runtime';
import { type ScenarioId, type ZoneCode, type EventType, type ScenarioPolicy, type TenantContext } from '@domain/recovery-resilience-models';

export type StoreRecordId = Brand<string, 'store-record'>;

export interface PlanState {
  readonly planId: StoreRecordId;
  readonly scenarioId: ScenarioId;
  readonly route: MeshRoute;
  readonly phase: 'queued' | 'running' | 'succeeded' | 'failed';
  readonly createdAt: number;
  readonly policy: ScenarioPolicy;
}

export interface EventRecord {
  readonly id: StoreRecordId;
  readonly runId: MeshRunId;
  readonly tenant: TenantContext;
  readonly eventType: EventType;
  readonly zone: ZoneCode;
  readonly severity: 'low' | 'elevated' | 'critical';
  readonly route: MeshRoute;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly policyId: Brand<string, 'scenario-policy-id'>;
  readonly createdAt: number;
}

export interface StoreQuery {
  readonly tenantId?: Brand<string, 'tenant-id'>;
  readonly zones?: readonly ZoneCode[];
  readonly eventTypes?: readonly EventType[];
  readonly runId?: MeshRunId;
}

export interface StoreAudit {
  readonly generatedAt: string;
  readonly source: string;
  readonly meta: Readonly<MeshMeta>;
}

export interface SearchResult {
  readonly records: readonly EventRecord[];
  readonly total: number;
  readonly audit: StoreAudit;
}

export interface ReadWriteStore<T> {
  read(): Promise<T[]>;
  write(item: T): Promise<void>;
  clear(): Promise<void>;
}

export type InboundRecord<T extends { readonly id: StoreRecordId }> = NoInfer<T>;
