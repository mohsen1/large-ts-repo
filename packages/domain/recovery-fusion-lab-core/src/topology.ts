import type { LabGraphNodeId, LabRunId, LabWavePhase } from './identifiers';

export type MeshNodeId = LabGraphNodeId;
export type MeshEdgeId = string & { readonly __brand: 'mesh-edge-id' };

export interface MeshNode {
  readonly id: MeshNodeId;
  readonly role: 'ingest' | 'transform' | 'aggregate' | 'simulate' | 'execute';
  readonly phase: LabWavePhase;
  readonly active: boolean;
  readonly weight: number;
}

export interface MeshDependency {
  readonly from: MeshNodeId;
  readonly to: MeshNodeId;
}

export interface MeshForecast {
  readonly timestamps: readonly string[];
  readonly values: readonly number[];
}

export interface MeshTopology {
  readonly runId: LabRunId;
  readonly phase: LabWavePhase;
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshDependency[];
}
