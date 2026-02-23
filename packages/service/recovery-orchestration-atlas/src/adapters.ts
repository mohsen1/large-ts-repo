import { type SnapshotPayload, assertSnapshotPayload, asRecoveryAtlasSnapshot } from '@domain/recovery-operations-atlas';
import { type RecoveryAtlasSnapshot } from '@domain/recovery-operations-atlas';

export interface HttpAtlasInput {
  readonly payload: string;
}

export interface AtlasHttpEnvelope {
  readonly snapshots: string[];
}

export interface AtlasHttpResult {
  readonly snapshots: readonly RecoveryAtlasSnapshot[];
  readonly count: number;
}

const toSnapshot = (payload: SnapshotPayload): RecoveryAtlasSnapshot => {
  return asRecoveryAtlasSnapshot({
    incidentId: payload.incidentId,
    tenantId: payload.tenantId,
    windows: payload.windows,
    nodes: payload.graph.nodes.map((node) => ({
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
    edges: payload.graph.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      dependencyWeight: edge.dependencyWeight,
      requiredFor: edge.requiredFor,
      isHardDependency: edge.isHardDependency,
      slaMinutes: edge.slaMinutes,
    })),
  });
};

export const decodeAtlasEnvelop = (envelope: AtlasHttpEnvelope): AtlasHttpResult => {
  const snapshots = envelope.snapshots
    .map((raw) => {
      const parsed = assertSnapshotPayload(JSON.parse(raw));
      return toSnapshot(parsed);
    })
    .filter((snapshot): snapshot is RecoveryAtlasSnapshot => snapshot.id.length > 0);

  return {
    snapshots,
    count: snapshots.length,
  };
};

export const decodeAtlasInput = (input: HttpAtlasInput): AtlasHttpResult => {
  return decodeAtlasEnvelop({ snapshots: [input.payload] });
};
