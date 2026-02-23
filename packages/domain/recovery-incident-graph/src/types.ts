import type { Brand, NonEmptyArray, PathTuple } from '@shared/type-level';

export type IncidentGraphId = Brand<string, 'IncidentGraphId'>;
export type IncidentNodeId = Brand<string, 'IncidentNodeId'>;
export type RecoveryPolicyId = Brand<string, 'RecoveryPolicyId'>;
export type ReadinessSignalId = Brand<string, 'ReadinessSignalId'>;
export type SimulationRunId = Brand<string, 'SimulationRunId'>;

export type GraphNodeState = 'idle' | 'ready' | 'blocked' | 'running' | 'warning' | 'complete' | 'failed' | 'cancelled';
export type GraphEdgeKind = 'explicit' | 'inferred' | 'control' | 'override';
export type GraphRiskBand = 'green' | 'yellow' | 'orange' | 'red';

export interface ReadinessWindow {
  readonly startIso: string;
  readonly endIso: string;
}

export interface RecoverySignal {
  readonly id: ReadinessSignalId;
  readonly sourceSystem: string;
  readonly severity: number;
  readonly confidence: number;
  readonly emittedAt: string;
  readonly details: Record<string, unknown>;
}

export interface IncidentGraphNodePayload {
  readonly type: string;
  readonly labels: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly controls: readonly string[];
}

export interface IncidentGraphNode<T extends IncidentGraphNodePayload = IncidentGraphNodePayload> {
  readonly id: IncidentNodeId;
  readonly tenantId: string;
  readonly title: string;
  readonly state: GraphNodeState;
  readonly score: number;
  readonly riskBand: GraphRiskBand;
  readonly policyIds: readonly RecoveryPolicyId[];
  readonly dependsOn: readonly IncidentNodeId[];
  readonly readinessAt: string;
  readonly payload: T;
  readonly durationMinutes: number;
}

export interface IncidentGraphEdge {
  readonly fromNodeId: IncidentGraphNode['id'];
  readonly toNodeId: IncidentGraphNode['id'];
  readonly weight: number;
  readonly kind: GraphEdgeKind;
  readonly label?: string;
  readonly conditional?: {
    readonly ifSignal: ReadinessSignalId;
    readonly threshold: number;
  };
}

export interface IncidentGraphMeta {
  readonly id: IncidentGraphId;
  readonly tenantId: string;
  readonly name: string;
  readonly ownerTeam: string;
  readonly simulationWindow: ReadinessWindow;
  readonly snapshot: {
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly nodeCount: number;
    readonly edgeCount: number;
  };
}

export interface IncidentGraph {
  readonly meta: IncidentGraphMeta;
  readonly nodes: readonly IncidentGraphNode[];
  readonly edges: readonly IncidentGraphEdge[];
}

export interface SimulationFrame {
  readonly runId: SimulationRunId;
  readonly graphId: IncidentGraphId;
  readonly index: number;
  readonly at: string;
  readonly completedNodeIds: readonly IncidentNodeId[];
  readonly blockedNodeIds: readonly IncidentNodeId[];
}

export interface SimulationSummary {
  readonly triggeredSignals: readonly ReadinessSignalId[];
  readonly failedNodeCount: number;
  readonly warningNodeCount: number;
  readonly completedNodeCount: number;
  readonly totalRiskPoints: number;
}

export interface SimulationOutcomeMetrics {
  readonly readiness: number;
  readonly riskReduction: number;
  readonly parallelismUtilization: number;
  readonly timelineCompression: number;
}

export interface SimulationResult {
  readonly runId: SimulationRunId;
  readonly graphId: IncidentGraphId;
  readonly success: boolean;
  readonly frames: readonly SimulationFrame[];
  readonly maxDepth: number;
  readonly predictedDowntimeMinutes: number;
  readonly summary: SimulationSummary;
  readonly metrics?: SimulationOutcomeMetrics;
}

export interface PlannerProfile {
  readonly id: RecoveryPolicyId;
  readonly tenantId: string;
  readonly profileName: string;
  readonly maxParallelism: number;
  readonly minReadinessWindowMinutes: number;
  readonly allowOverrides: boolean;
  readonly allowReentrance: boolean;
}

export interface PlannerConfig {
  readonly id: Brand<string, 'PlannerConfigId'>;
  readonly profile: PlannerProfile;
  readonly graphWindowMinutes: number;
  readonly signalGraceMinutes: number;
  readonly failureTolerancePercent: number;
  readonly maxRetries: number;
  readonly preferredOrdering: 'criticality' | 'chronology' | 'criticality-first';
}

export interface PlannerInstruction {
  readonly nodeId: IncidentNodeId;
  readonly phase: number;
  readonly startAtOffsetMinutes: number;
  readonly reason: string;
  readonly prerequisites: readonly IncidentNodeId[];
  readonly risks: Record<GraphRiskBand, number>;
}

export interface ExecutionPlan {
  readonly id: Brand<string, 'ExecutionPlanId'>;
  readonly graphId: IncidentGraphId;
  readonly issuedAt: string;
  readonly instructions: readonly PlannerInstruction[];
  readonly estimatedDurationMinutes: number;
}

export interface PlannerTrace {
  readonly attempt: number;
  readonly nodeId: IncidentNodeId;
  readonly message: string;
  readonly at: string;
}

export interface PlannerOutput {
  readonly planId: Brand<string, 'ExecutionPlanId'>;
  readonly plan: ExecutionPlan;
  readonly traces: readonly PlannerTrace[];
}

export interface RuntimeNodeState {
  readonly nodeId: IncidentNodeId;
  readonly state: GraphNodeState;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly attempts: number;
}

export interface RuntimeEvent {
  readonly eventId: Brand<string, 'RuntimeEventId'>;
  readonly runId: SimulationRunId;
  readonly nodeId: IncidentNodeId;
  readonly type: 'state-change' | 'signal-emitted' | 'policy-applied' | 'error';
  readonly at: string;
  readonly payload: Record<string, unknown>;
}

export interface RuntimeState {
  readonly runId: SimulationRunId;
  readonly graphId: IncidentGraphId;
  readonly startedAt: string;
  readonly nodes: readonly RuntimeNodeState[];
  readonly events: readonly RuntimeEvent[];
}

export interface PolicyRule<TContext = IncidentGraphNode> {
  readonly id: Brand<string, 'PolicyRuleId'>;
  readonly name: string;
  readonly description: string;
  readonly condition: (node: TContext) => boolean;
  readonly onMatch: (node: TContext) => Partial<TContext>;
}

export interface ReadinessSignal {
  readonly id: ReadinessSignalId;
  readonly targetNodeId: IncidentNodeId;
  readonly value: number;
  readonly reason: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
}

export interface ValidationOutcome {
  readonly graphId: IncidentGraphId;
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface RiskVector {
  readonly severity: number;
  readonly confidence: number;
  readonly uncertainty: number;
}

export interface TopologyHeatPoint {
  readonly nodeId: IncidentNodeId;
  readonly depth: number;
  readonly inbound: number;
  readonly outbound: number;
  readonly risk: RiskVector;
}

export interface GraphAnalysisReport {
  readonly graphId: IncidentGraphId;
  readonly generatedAt: string;
  readonly riskHotspots: readonly TopologyHeatPoint[];
  readonly criticalPath: readonly CriticalPathEdge[];
  readonly longestLevel: number;
  readonly clusterCount: number;
  readonly readyNodes: readonly IncidentNodeId[];
}

export interface CriticalPathEdge {
  readonly from: IncidentNodeId;
  readonly to: IncidentNodeId;
  readonly score: number;
}

export type NodeByState<T extends GraphNodeState> = Pick<IncidentGraphNode, 'id' | 'state'> & { readonly state: T };
export type GroupByState = Record<GraphNodeState, readonly IncidentGraphNode[]>;

export interface SimulationScenario {
  readonly scenarioId: string;
  readonly graph: IncidentGraph;
  readonly signals: readonly ReadinessSignal[];
  readonly maxTicks: number;
  readonly randomSeed?: number;
}

export interface ReadinessState {
  readonly graphId: IncidentGraphId;
  readonly at: string;
  readonly score: number;
  readonly trend: readonly number[];
  readonly signals: readonly RecoverySignal[];
}

export interface PlannerOutputInput {
  readonly output: PlannerOutput;
  readonly path: PathTuple<IncidentGraph>;
}
