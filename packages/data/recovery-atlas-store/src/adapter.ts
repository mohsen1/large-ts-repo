import { type RecoveryAtlasSnapshot, type RecoveryAtlasTelemetryEvent, type SnapshotPayload, assertSnapshotPayload, asRecoveryAtlasSnapshot, type ExternalTopologyPayload } from '@domain/recovery-operations-atlas';
import { asAtlasStoreId, type AtlasStoreEnvelope, type AtlasStoreRecord } from './models';

export interface IncomingStoreRecord {
  readonly id: string;
  readonly snapshot: string;
  readonly updatedAt: string;
  readonly tenantId: string;
}

export interface IncomingRunbook {
  readonly id: string;
  readonly eventHistory: readonly RecoveryAtlasTelemetryEvent[];
  readonly persistedAt: string;
}

export interface IncomingStoreEnvelope {
  readonly records: readonly IncomingStoreRecord[];
  readonly runbooks: readonly IncomingRunbook[];
}

export interface LegacyAtlasRecord {
  readonly incidentId: string;
  readonly tenantId: string;
  readonly topology: ExternalTopologyPayload;
  readonly generatedAt: string;
}

export const parseSnapshotPayload = (payload: string): SnapshotPayload => {
  return assertSnapshotPayload(JSON.parse(payload));
};

export const parseIncomingEnvelope = (payload: string): AtlasStoreEnvelope => {
  const incoming = JSON.parse(payload) as IncomingStoreEnvelope;
  if (!incoming || !Array.isArray(incoming.records)) {
    return { records: [], runbooks: [] };
  }

  const records: AtlasStoreRecord[] = incoming.records
    .map((record) => {
      try {
        const parsed = parseSnapshotPayload(record.snapshot);
        const snapshot = asRecoveryAtlasSnapshot({
          tenantId: record.tenantId,
          incidentId: parsed.incidentId,
          windows: parsed.windows.map((window) => ({
            id: window.id,
            label: window.label,
            order: window.order,
            priority: window.priority,
          })),
          nodes: parsed.graph.nodes.map((node) => ({
            id: node.id,
            windowId: node.windowId,
            component: node.component,
            region: node.region,
            environment: node.environment,
            severity: node.severity,
            driftState: node.driftState,
            recoveredBySlaMinutes: node.recoveredBySlaMinutes,
            ownerTeam: node.ownerTeam,
            resilienceTags: node.resilienceTags,
            tags: node.tags,
          })),
          edges: parsed.graph.edges.map((edge) => ({
            id: edge.id,
            from: edge.from,
            to: edge.to,
            dependencyWeight: edge.dependencyWeight,
            requiredFor: edge.requiredFor,
            isHardDependency: edge.isHardDependency,
            slaMinutes: edge.slaMinutes,
          })),
        });

        return {
          id: asAtlasStoreId(record.id),
          snapshot,
          tenantId: record.tenantId,
          updatedAt: record.updatedAt,
        };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is AtlasStoreRecord => entry !== undefined);

  return {
    records,
    runbooks: incoming.runbooks.map((runbook) => ({
      id: asAtlasStoreId(runbook.id),
      eventHistory: runbook.eventHistory,
      persistedAt: runbook.persistedAt,
    })),
  };
};

export const normalizeLegacy = (records: readonly LegacyAtlasRecord[]): readonly RecoveryAtlasSnapshot[] => {
  return records
    .map((entry) => asRecoveryAtlasSnapshot(entry.topology))
    .filter((snapshot) => snapshot.incidentId.length > 0);
};
