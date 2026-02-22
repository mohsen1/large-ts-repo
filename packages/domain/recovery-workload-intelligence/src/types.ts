export type WorkloadUnitId = string & { readonly __tag: unique symbol };
export type ResourceId = string & { readonly __tag: unique symbol };
export type ScenarioId = string & { readonly __tag: unique symbol };
export type Region = 'us-east-1' | 'us-west-2' | 'eu-west-1';

export interface IncidentRiskVector {
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly blastRadius: 'zone' | 'region' | 'global';
  readonly customerImpact: number;
  readonly recoveryToleranceSeconds: number;
}

export interface WorkloadNode {
  readonly id: WorkloadUnitId;
  readonly name: string;
  readonly team: string;
  readonly region: Region;
  readonly primaryDependencies: readonly WorkloadUnitId[];
  readonly criticality: 1 | 2 | 3 | 4 | 5;
  readonly targetSlaMinutes: number;
}

export interface WorkloadSnapshot {
  readonly nodeId: WorkloadUnitId;
  readonly timestamp: string;
  readonly cpuUtilization: number;
  readonly iopsUtilization: number;
  readonly errorRate: number;
  readonly throughput: number;
}

export interface ScenarioForecast {
  readonly scenarioId: ScenarioId;
  readonly nodeId: WorkloadUnitId;
  readonly name: string;
  readonly confidence: number;
  readonly projectedDowntimeMinutes: number;
  readonly mitigationSuggestions: readonly string[];
}

export interface ForecastInput {
  readonly node: WorkloadNode;
  readonly snapshot: WorkloadSnapshot;
  readonly riskVector: IncidentRiskVector;
  readonly lookbackDays: number;
}

export const isWorkloadNodeShape = (value: unknown): value is Pick<WorkloadNode, 'id' | 'name' | 'team'> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<WorkloadNode>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.team === 'string';
};

export const isSnapshotShape = (value: unknown): value is WorkloadSnapshot => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<WorkloadSnapshot>;
  return (
    typeof candidate.nodeId === 'string'
    && typeof candidate.timestamp === 'string'
    && typeof candidate.cpuUtilization === 'number'
    && typeof candidate.iopsUtilization === 'number'
    && typeof candidate.errorRate === 'number'
    && typeof candidate.throughput === 'number'
  );
};

export interface WorkloadDependencyEdge {
  readonly parent: WorkloadUnitId;
  readonly child: WorkloadUnitId;
  readonly relationship: 'hard' | 'soft';
  readonly latencyMs: number;
}

export interface WorkloadDependencyGraph {
  readonly nodes: readonly WorkloadNode[];
  readonly edges: readonly WorkloadDependencyEdge[];
}

export interface WorkloadRiskProfile {
  readonly workloadId: WorkloadUnitId;
  readonly riskScore: number;
  readonly riskClass: 'low' | 'medium' | 'high' | 'critical';
  readonly contributingFactors: readonly { readonly factor: string; readonly weight: number }[];
}

export const safeRiskClass = (risk: number): WorkloadRiskProfile['riskClass'] => {
  if (risk >= 0.85) {
    return 'critical';
  }
  if (risk >= 0.65) {
    return 'high';
  }
  if (risk >= 0.35) {
    return 'medium';
  }
  return 'low';
};

export const serializeWorkloadId = (prefix: string, raw: string): WorkloadUnitId => `${prefix}-${raw}` as WorkloadUnitId;

export const serializeScenarioId = (name: string): ScenarioId => `${name}-scenario` as ScenarioId;
