export type IdPrefix = 'playbook' | 'scenario' | 'policy' | 'evidence';

export type PlaybookId = string;
export type ScenarioId = string;
export type PolicyId = string;
export type EvidenceId = string;

export type ReadinessBand = 'green' | 'amber' | 'red';
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ExecutionMode = 'dry-run' | 'canary' | 'full';

export interface TenantContext {
  readonly tenantId: string;
  readonly region: string;
  readonly environment: 'prod' | 'staging' | 'sandbox';
}

export interface BaseMetricPoint {
  readonly at: string;
  readonly value: number;
  readonly unit: string;
}

export interface ReadinessMetric extends BaseMetricPoint {
  readonly metric: string;
  readonly source: string;
  readonly band: ReadinessBand;
}

export interface Evidence {
  readonly id: EvidenceId;
  readonly kind: 'telemetry' | 'slo' | 'policy' | 'agent';
  readonly summary: string;
  readonly payload: Record<string, unknown>;
}

export interface DriftSignal {
  readonly id: string;
  readonly signal: string;
  readonly severity: SignalSeverity;
  readonly tags: readonly string[];
  readonly confidence: number;
  readonly capturedAt: string;
  readonly evidence: readonly Evidence[];
}

export interface ScenarioNode {
  readonly id: ScenarioId;
  readonly name: string;
  readonly dependencies: readonly ScenarioId[];
  readonly expectedDurationMinutes: number;
  readonly riskImpact: number;
  readonly signals: readonly DriftSignal[];
  readonly policyBindings: readonly PolicyId[];
}

export interface ScenarioGraph {
  readonly nodes: Record<string, ScenarioNode>;
  readonly order: readonly ScenarioId[];
  readonly metadata: {
    readonly estimatedDurationMinutes: number;
    readonly blastRadius: ReadinessBand;
  };
}

export interface RecoveryPlaybookPolicy {
  readonly id: PolicyId;
  readonly name: string;
  readonly owner: string;
  readonly description: string;
  readonly requiredPolicies: readonly PolicyId[];
  readonly forbiddenPolicies: readonly PolicyId[];
}

export interface RecoveryPlaybookModel {
  readonly id: PlaybookId;
  readonly title: string;
  readonly tenant: string;
  readonly createdAt: string;
  readonly scenarioGraph: ScenarioGraph;
  readonly policies: Record<string, RecoveryPlaybookPolicy>;
  readonly priorities: readonly ScenarioId[];
  readonly confidence: number;
}

export interface PlanningWindow {
  readonly start: string;
  readonly end: string;
  readonly mode: ExecutionMode;
}

export interface SimulationTrace {
  readonly step: ScenarioId;
  readonly startedAt: string;
  readonly startedBy: string;
  readonly outcome: 'pass' | 'fail' | 'blocked';
  readonly metrics: ReadonlyArray<ReadinessMetric>;
}

export interface OrchestrationPlan {
  readonly id: string;
  readonly playbookId: PlaybookId;
  readonly window: PlanningWindow;
  readonly trace: readonly SimulationTrace[];
  readonly version: number;
}

export interface PlanEnvelope<TPlan extends OrchestrationPlan = OrchestrationPlan> {
  readonly tenantContext: TenantContext;
  readonly plan: TPlan;
  readonly rationale: string;
  readonly createdAt: string;
}

export interface ReadinessBandSnapshot {
  readonly windowStart: string;
  readonly scores: {
    readonly green: number;
    readonly amber: number;
    readonly red: number;
  };
  readonly trend: 'up' | 'flat' | 'down';
}

export interface OrchestrationOutcome {
  readonly id: string;
  readonly planId: string;
  readonly finalBand: ReadinessBand;
  readonly success: boolean;
  readonly durationMinutes: number;
  readonly traces: readonly SimulationTrace[];
  readonly telemetrySnapshot: ReadinessBandSnapshot;
}

export interface PolicyViolation {
  readonly policyId: PolicyId;
  readonly reason: string;
  readonly severity: SignalSeverity;
}

export interface HealthIndicator {
  readonly key: string;
  readonly score: number;
  readonly band: ReadinessBand;
  readonly reason: string;
}

export type OrchestrationHealth = {
  readonly playbookId: PlaybookId;
  readonly indicators: readonly HealthIndicator[];
  readonly score: number;
  readonly band: ReadinessBand;
};

export interface OrchestrationOptions {
  readonly planningMode?: ExecutionMode;
  readonly enforcePolicy?: boolean;
  readonly parallelismLimit?: number;
}
