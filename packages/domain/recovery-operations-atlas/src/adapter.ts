import { type RecoveryAtlasSnapshot, type RecoveryAtlasNode, type RecoveryAtlasEdge, type RecoveryAtlasWindowId, type RecoveryAtlasIncidentId } from './types';

export interface ExternalTopologyPayload {
  readonly incidentId: string;
  readonly tenantId: string;
  readonly windows: {
    readonly id: string;
    readonly label: string;
    readonly order: number;
    readonly priority: number;
  }[];
  readonly nodes: {
    readonly id: string;
    readonly windowId: string;
    readonly component: string;
    readonly region: string;
    readonly environment: 'prod' | 'stage' | 'dr' | 'canary';
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly driftState: 'stable' | 'degraded' | 'disruptive' | 'critical';
    readonly recoveredBySlaMinutes: number;
    readonly ownerTeam: string;
    readonly resilienceTags: string[];
    readonly tags: string[];
  }[];
  readonly edges: {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly dependencyWeight: number;
    readonly requiredFor: string[];
    readonly isHardDependency: boolean;
    readonly slaMinutes: number;
  }[];
}

export const asRecoveryAtlasNode = (node: ExternalTopologyPayload['nodes'][number]): RecoveryAtlasNode => ({
  id: node.id as RecoveryAtlasNode['id'],
  windowId: node.windowId as RecoveryAtlasWindowId,
  component: node.component,
  region: node.region,
  environment: node.environment,
  severity: node.severity,
  driftState: node.driftState,
  recoveredBySlaMinutes: node.recoveredBySlaMinutes,
  ownerTeam: node.ownerTeam,
  resilienceTags: node.resilienceTags,
  tags: node.tags,
});

export const asRecoveryAtlasEdge = (edge: ExternalTopologyPayload['edges'][number]): RecoveryAtlasEdge => ({
  id: edge.id as RecoveryAtlasEdge['id'],
  from: edge.from as RecoveryAtlasNode['id'],
  to: edge.to as RecoveryAtlasNode['id'],
  dependencyWeight: edge.dependencyWeight,
  requiredFor: edge.requiredFor,
  isHardDependency: edge.isHardDependency,
  slaMinutes: edge.slaMinutes,
});

export const asRecoveryAtlasSnapshot = (payload: ExternalTopologyPayload): RecoveryAtlasSnapshot => {
  const incidentId = payload.incidentId as RecoveryAtlasIncidentId;
  const windows = payload.windows.map((window) => ({
    id: window.id as RecoveryAtlasWindowId,
    label: window.label,
    order: window.order,
    priority: window.priority,
  }));

  return {
    id: payload.windows[0]?.id as RecoveryAtlasWindowId,
    incidentId,
    tenantId: payload.tenantId,
    windows,
    graph: {
      nodes: payload.nodes.map(asRecoveryAtlasNode),
      edges: payload.edges.map(asRecoveryAtlasEdge),
    },
    constraints: [],
    plans: [],
    generatedAt: new Date().toISOString(),
  };
};
