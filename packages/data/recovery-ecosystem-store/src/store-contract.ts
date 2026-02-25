import type { JsonValue } from '@shared/type-level';
import type { RunId, StageId, TenantId, NamespaceTag } from '@domain/recovery-ecosystem-core';

export interface EcosystemAuditEvent<TPayload extends JsonValue = JsonValue> {
  readonly namespace: NamespaceTag;
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly stageId?: StageId;
  readonly event: `event:${string}`;
  readonly at: string;
  readonly payload: TPayload;
}

export interface EcosystemSnapshot {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly payload: JsonValue;
  readonly generatedAt: string;
}

export interface EcosystemStorePort {
  save(snapshot: EcosystemSnapshot): Promise<void>;
  load(runId: RunId): Promise<EcosystemSnapshot | undefined>;
  append(event: EcosystemAuditEvent<JsonValue>): Promise<void>;
  read(runId: RunId): Promise<AsyncIterable<EcosystemAuditEvent<JsonValue>>>;
  query(namespace: NamespaceTag): Promise<readonly EcosystemSnapshot[]>;
  loadAndHydrate(runId: RunId): Promise<{
    readonly snapshot?: EcosystemSnapshot;
    readonly events: readonly EcosystemAuditEvent<JsonValue>[];
  }>;
  stats(): StoreStats;
  flush(): Promise<void>;
}

export interface StoreEnvelope<TValue extends JsonValue = JsonValue> {
  readonly version: `v${number}`;
  readonly payload: TValue;
  readonly checksum: string;
}

export interface StoreStats {
  readonly snapshots: number;
  readonly events: number;
  readonly lastFlush?: string;
  readonly namespaceCount: number;
}

export interface StoreStatus {
  readonly runCount: number;
  readonly eventCount: number;
  readonly lastUpdated: string;
}
