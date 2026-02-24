export type FabricNodeId = `node:${string}`;
export type FabricPlanId = `plan:${string}`;
export type FabricWindowId = `window:${string}`;
export type FabricSignalId = `signal:${string}`;
export type FabricWorkspaceId = `workspace:${string}`;
export type CadenceWorkspaceId = FabricWorkspaceId;
export type FabricRunId = `run:${string}`;

export type CadenceRiskBand = 'green' | 'amber' | 'red';
export type CadenceExecutionMode = 'drain' | 'burst' | 'stitch';

export interface TenantContext {
  readonly tenantId: string;
  readonly region: string;
  readonly environment: 'prod' | 'staging' | 'sandbox';
}

export interface FabricSignal {
  readonly signalId: FabricSignalId;
  readonly source: string;
  readonly category: 'sli' | 'capacity' | 'dependency' | 'policy';
  readonly weight: number;
  readonly intensity: number;
  readonly createdAt: string;
  readonly tags: readonly string[];
}

export interface FabricSignalEnvelope {
  readonly signal: FabricSignal;
  readonly signalRatePerMinute: number;
  readonly historicalConfidence: number;
  readonly notes: readonly string[];
}

export interface FabricDependencyDescriptor {
  readonly target: FabricNodeId;
  readonly weight: number;
  readonly mandatory: boolean;
}

export interface CadenceDependency {
  readonly from: FabricNodeId;
  readonly to: FabricNodeId;
  readonly reason: 'data' | 'policy' | 'capacity';
}

export interface FabricNode {
  readonly nodeId: FabricNodeId;
  readonly name: string;
  readonly region: string;
  readonly criticality: number;
  readonly dependencies: readonly FabricDependencyDescriptor[];
}

export interface CadenceWindow {
  readonly windowId: FabricWindowId;
  readonly index: number;
  readonly startIso: string;
  readonly endIso: string;
  readonly nodeIds: readonly FabricNodeId[];
  readonly requestedMode: CadenceExecutionMode;
}

export interface CadenceConstraintSet {
  readonly tenant: TenantContext;
  readonly maxWindowMinutes: number;
  readonly maxParallelWindows: number;
  readonly minCoveragePct: number;
  readonly allowLateStart: boolean;
  readonly maxCriticalitySkew: number;
}

export interface CadencePlan {
  readonly planId: FabricPlanId;
  readonly workspaceId: FabricWorkspaceId;
  readonly generatedAt: string;
  readonly windows: readonly CadenceWindow[];
  readonly nodeOrder: readonly FabricNodeId[];
  readonly constraints: CadenceConstraintSet;
  readonly metadata: {
    readonly owner: string;
    readonly priority: number;
    readonly mode: CadenceExecutionMode;
    readonly requestedThroughput: number;
  };
}

export interface CadenceCommand {
  readonly planId: CadencePlan['planId'];
  readonly operatorId: string;
  readonly requestedSignalIds: readonly FabricSignalId[];
  readonly requestedThroughput: number;
  readonly mode: CadenceExecutionMode;
}

export interface ConstraintViolation {
  readonly rule: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly message: string;
  readonly context: Record<string, unknown>;
}

export interface CadenceDraft {
  readonly draftId: `draft:${string}`;
  readonly generatedBy: string;
  readonly createdAt: string;
  readonly candidatePlan: CadencePlan;
  readonly violations: readonly ConstraintViolation[];
}

export interface CadenceRuntimeIntent {
  readonly intentId: `intent:${string}`;
  readonly tenantId: string;
  readonly description: string;
  readonly acceptedSignals: readonly FabricSignalId[];
  readonly blockedSignals: readonly FabricSignalId[];
  readonly confidence: number;
  readonly requestedAt: string;
}

export interface FabricRunSnapshot {
  readonly runId: FabricRunId;
  readonly planId: CadencePlan['planId'];
  readonly startedAt: string;
  readonly expectedEndAt: string;
  readonly activeWindowId?: CadenceWindow['windowId'];
  readonly signalCount: number;
  readonly throughput: number;
  readonly completedWindows: readonly CadenceWindow['windowId'][];
}

export interface FabricHealth {
  readonly signalCoverage: number;
  readonly riskBand: CadenceRiskBand;
  readonly overloadedNodes: readonly FabricNodeId[];
  readonly blockedDependencies: readonly CadenceDependency[];
}

export interface CadenceForecast {
  readonly planId: CadencePlan['planId'];
  readonly trend: 'up' | 'flat' | 'down';
  readonly expectedDurationMs: number;
  readonly confidence: number;
  readonly riskCurve: readonly { at: string; risk: number }[];
}

export interface CadenceWorkspaceState {
  readonly workspaceId: FabricWorkspaceId;
  readonly tenant: TenantContext;
  readonly nodeCatalog: readonly FabricNode[];
  readonly activePlan?: CadencePlan;
  readonly activeRun?: FabricRunSnapshot;
  readonly latestForecast?: CadenceForecast;
  readonly lastHealth?: FabricHealth;
}

export interface TopologyBuildResult {
  readonly nodeById: Record<FabricNodeId, FabricNode>;
  readonly dependencies: readonly CadenceDependency[];
  readonly roots: readonly FabricNodeId[];
  readonly leaves: readonly FabricNodeId[];
  readonly levels: readonly ReadonlyArray<FabricNodeId>[];
}
