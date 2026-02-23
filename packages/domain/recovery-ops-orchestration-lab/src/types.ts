import type { Brand, JsonValue } from '@shared/type-level';

export type OrchestrationLabId = Brand<string, 'OrchestrationLabId'>;
export type LabPlanId = Brand<string, 'LabPlanId'>;
export type SurfaceEnvelopeId = Brand<string, 'SurfaceEnvelopeId'>;
export type LabRunId = Brand<string, 'LabRunId'>;
export type LabWindowId = Brand<string, 'PlanWindowId'>;
export type CommandPolicyId = Brand<string, 'OrchestrationPolicyId'>;

export type LifecycleState = 'draft' | 'armed' | 'executing' | 'reviewed' | 'retired';
export type LabSignalTier = 'signal' | 'warning' | 'critical';
export type StepType = 'detect' | 'assess' | 'contain' | 'recover' | 'validate';

export interface LabTag {
  readonly key: string;
  readonly value: string;
}

export interface LabSignal {
  readonly id: string;
  readonly labId: OrchestrationLabId;
  readonly source: string;
  readonly tier: LabSignalTier;
  readonly title: string;
  readonly score: number;
  readonly message: string;
  readonly createdAt: string;
  readonly tags: readonly LabTag[];
}

export interface LabDependency {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface LabStep {
  readonly id: string;
  readonly type: StepType;
  readonly name: string;
  readonly command: string;
  readonly expectedMinutes: number;
  readonly owner: string;
  readonly dependencies: readonly LabDependency[];
  readonly risk: number;
  readonly reversible: boolean;
  readonly tags: readonly string[];
}

export interface LabPlan {
  readonly id: LabPlanId;
  readonly labId: OrchestrationLabId;
  readonly title: string;
  readonly description: string;
  readonly steps: readonly LabStep[];
  readonly state: LifecycleState;
  readonly score: number;
  readonly confidence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlanWindow {
  readonly id: LabWindowId;
  readonly labId: OrchestrationLabId;
  readonly from: string;
  readonly to: string;
  readonly preferredTimezone: string;
  readonly blackoutMinutes: readonly number[];
}

export interface LabIntent {
  readonly tenantId: string;
  readonly siteId: string;
  readonly urgency: 'normal' | 'urgent' | 'critical';
  readonly rationale: string;
  readonly owner: string;
  readonly requestedAt: string;
  readonly tags: readonly string[];
}

export interface OrchestrationLab {
  readonly id: OrchestrationLabId;
  readonly scenarioId: string;
  readonly tenantId: string;
  readonly incidentId: string;
  readonly title: string;
  readonly signals: readonly LabSignal[];
  readonly windows: readonly PlanWindow[];
  readonly plans: readonly LabPlan[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrchestrationLabEnvelope {
  readonly id: SurfaceEnvelopeId;
  readonly state: LifecycleState;
  readonly lab: OrchestrationLab;
  readonly intent: LabIntent;
  readonly plans: readonly LabPlan[];
  readonly windows: readonly PlanWindow[];
  readonly metadata: Record<string, JsonValue>;
  readonly revision: number;
}

export interface LabExecution {
  readonly id: LabRunId;
  readonly planId: LabPlanId;
  readonly labId: OrchestrationLabId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'running' | 'succeeded' | 'failed' | 'paused';
  readonly stepCount: number;
  readonly logs: readonly string[];
  readonly metadata: Record<string, JsonValue>;
}

export interface OrchestrationPolicy {
  readonly id: CommandPolicyId;
  readonly tenantId: string;
  readonly maxParallelSteps: number;
  readonly minConfidence: number;
  readonly allowedTiers: readonly LabSignalTier[];
  readonly minWindowMinutes: number;
  readonly timeoutMinutes: number;
}

export interface LabPlanDraft {
  readonly id: string;
  readonly labId: OrchestrationLabId;
  readonly draftName: string;
  readonly title: string;
  readonly description: string;
  readonly steps: readonly LabStep[];
  readonly state: LifecycleState;
  readonly score: number;
  readonly confidence: number;
}

export interface PlanScore {
  readonly labId: OrchestrationLabId;
  readonly planId: LabPlanId;
  readonly readiness: number;
  readonly resilience: number;
  readonly complexity: number;
  readonly controlImpact: number;
  readonly timestamp: string;
}

export interface TimelineEvent {
  readonly id: Brand<string, 'TimelineEventId'>;
  readonly labId: OrchestrationLabId;
  readonly kind: 'signal' | 'plan' | 'run' | 'decision';
  readonly timestamp: string;
  readonly actor: string;
  readonly detail: string;
  readonly metadata: Record<string, JsonValue>;
}

export interface TimelineSegment {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly steps: readonly string[];
  readonly health: number;
}

export interface DomainAdapterState {
  readonly envelope: OrchestrationLabEnvelope;
  readonly selectedPlan?: LabPlan;
  readonly scores: readonly PlanScore[];
}

export interface DomainEvent {
  readonly type: 'lab-created' | 'plan-selected' | 'run-finished' | 'signal-added';
  readonly labId: OrchestrationLabId;
  readonly timestamp: string;
}
