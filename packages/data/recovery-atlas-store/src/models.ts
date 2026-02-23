import { type RecoveryAtlasSnapshot, type RecoveryAtlasFilter, type RecoveryAtlasWindowId, type RecoveryAtlasIncidentId, type RecoveryAtlasTelemetryEvent } from '@domain/recovery-operations-atlas';

export type AtlasStoreId = `atlas-store:${string}`;

export const asAtlasStoreId = (value: string): AtlasStoreId => `atlas-store:${value}` as AtlasStoreId;

export interface AtlasStoreRecord {
  readonly id: AtlasStoreId;
  readonly snapshot: RecoveryAtlasSnapshot;
  readonly updatedAt: string;
  readonly tenantId: string;
}

export interface AtlasStoreQuery {
  readonly incidentId?: RecoveryAtlasIncidentId;
  readonly windowId?: RecoveryAtlasWindowId;
  readonly filter?: RecoveryAtlasFilter;
}

export interface AtlasRunbook {
  readonly id: AtlasStoreId;
  readonly eventHistory: readonly RecoveryAtlasTelemetryEvent[];
  readonly persistedAt: string;
}

export interface AtlasStoreEnvelope {
  readonly records: readonly AtlasStoreRecord[];
  readonly runbooks: readonly AtlasRunbook[];
}

export const emptyStoreEnvelope = (): AtlasStoreEnvelope => ({
  records: [],
  runbooks: [],
});
