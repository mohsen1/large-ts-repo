export type Brand<Value, T extends string> = Value & { readonly __brand: T };

export type RecoveryAtlasNodeId = Brand<string, 'RecoveryAtlasNodeId'>;
export type RecoveryAtlasEdgeId = Brand<string, 'RecoveryAtlasEdgeId'>;
export type RecoveryAtlasPlanId = Brand<string, 'RecoveryAtlasPlanId'>;
export type RecoveryAtlasRunId = Brand<string, 'RecoveryAtlasRunId'>;
export type RecoveryAtlasWindowId = Brand<string, 'RecoveryAtlasWindowId'>;
export type RecoveryAtlasIncidentId = Brand<string, 'RecoveryAtlasIncidentId'>;

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type DriftState = 'stable' | 'degraded' | 'disruptive' | 'critical';

export interface AtlasDimension {
  readonly id: RecoveryAtlasWindowId;
  readonly label: string;
  readonly order: number;
  readonly priority: number;
}

export interface RecoveryAtlasNode {
  readonly id: RecoveryAtlasNodeId;
  readonly windowId: RecoveryAtlasWindowId;
  readonly component: string;
  readonly region: string;
  readonly environment: 'prod' | 'stage' | 'dr' | 'canary';
  readonly severity: Severity;
  readonly driftState: DriftState;
  readonly recoveredBySlaMinutes: number;
  readonly ownerTeam: string;
  readonly resilienceTags: readonly string[];
  readonly tags: readonly string[];
}

export interface RecoveryAtlasEdge {
  readonly id: RecoveryAtlasEdgeId;
  readonly from: RecoveryAtlasNodeId;
  readonly to: RecoveryAtlasNodeId;
  readonly dependencyWeight: number;
  readonly requiredFor: readonly string[];
  readonly isHardDependency: boolean;
  readonly slaMinutes: number;
}

export interface RecoveryAtlasConstraint {
  readonly key: string;
  readonly nodeId: RecoveryAtlasNodeId;
  readonly message: string;
  readonly severity: Severity;
  readonly active: boolean;
}

export interface RecoveryAtlasRunStep {
  readonly id: Brand<string, 'RecoveryAtlasRunStepId'>;
  readonly label: string;
  readonly owner: string;
  readonly expectedDurationMinutes: number;
  readonly requiredApprovals: readonly string[];
  readonly dependsOn: readonly string[];
}

export interface RecoveryAtlasPlan {
  readonly id: RecoveryAtlasPlanId;
  readonly nodeIds: readonly RecoveryAtlasNodeId[];
  readonly title: string;
  readonly notes: string;
  readonly priority: number;
  readonly estimatedMinutes: number;
  readonly steps: readonly RecoveryAtlasRunStep[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecoveryAtlasSnapshot {
  readonly id: RecoveryAtlasWindowId;
  readonly incidentId: RecoveryAtlasIncidentId;
  readonly tenantId: string;
  readonly windows: readonly AtlasDimension[];
  readonly graph: {
    readonly nodes: readonly RecoveryAtlasNode[];
    readonly edges: readonly RecoveryAtlasEdge[];
  };
  readonly constraints: readonly RecoveryAtlasConstraint[];
  readonly plans: readonly RecoveryAtlasPlan[];
  readonly generatedAt: string;
}

export interface RecoveryAtlasFilter {
  readonly tenantId?: string;
  readonly region?: string;
  readonly severity?: Severity | readonly Severity[];
  readonly componentPrefix?: string;
  readonly environment?: RecoveryAtlasNode['environment'] | readonly RecoveryAtlasNode['environment'][];
}

export interface RecoveryAtlasTelemetryEvent {
  readonly source: string;
  readonly type:
    | 'node_added'
    | 'plan_generated'
    | 'validation_failed'
    | 'run_completed'
    | 'run_failed'
    | 'runbook-event';
  readonly at: string;
  readonly runId?: RecoveryAtlasRunId;
  readonly planId?: RecoveryAtlasPlanId;
  readonly incidentId?: RecoveryAtlasIncidentId;
  readonly message: string;
  readonly severity: Severity;
  readonly metadata: Record<string, unknown>;
}

export interface RecoveryAtlasRunReport {
  readonly runId: RecoveryAtlasRunId;
  readonly planId: RecoveryAtlasPlanId;
  readonly tenantId: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly passed: boolean;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly warnings: readonly string[];
  readonly diagnostics: readonly RecoveryAtlasTelemetryEvent[];
}

export interface RecoveryAtlasDecisionContext {
  readonly incidentId: RecoveryAtlasIncidentId;
  readonly candidateWindowIds: readonly RecoveryAtlasWindowId[];
  readonly maxStepBudget: number;
  readonly resilienceBias: number;
  readonly allowedRegions: readonly string[];
  readonly allowDegraded: boolean;
}

export interface PlanEnvelope {
  readonly planId: RecoveryAtlasPlanId;
  readonly windowIds: readonly RecoveryAtlasWindowId[];
  readonly confidence: number;
  readonly reasoning: readonly string[];
}
