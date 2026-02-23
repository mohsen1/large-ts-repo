import type { Brand, JsonValue } from '@shared/type-level';

export type CommandSurfaceId = Brand<string, 'CommandSurfaceId'>;
export type CommandSignalId = Brand<string, 'CommandSignalId'>;
export type CommandPlanId = Brand<string, 'CommandPlanId'>;
export type CommandWindowId = Brand<string, 'CommandWindowId'>;
export type ExecutionWaveId = Brand<string, 'ExecutionWaveId'>;

export type RecoveryCommandPhase = 'observe' | 'stabilize' | 'validate' | 'scale' | 'handoff';
export type ConstraintTier = 'hard' | 'guardrail' | 'advisory';
export type CommandRisk = 'low' | 'medium' | 'high' | 'critical';

export interface CommandSignal {
  readonly id: CommandSignalId;
  readonly source: string;
  readonly phase: RecoveryCommandPhase;
  readonly confidence: number;
  readonly impactScore: number;
  readonly createdAt: string;
  readonly labels: readonly string[];
  readonly metadata: JsonValue;
}

export interface CommandExecutionDependency {
  readonly dependsOnStepId: CommandWaveStepId;
  readonly kind: 'must-run-before' | 'can-run-with' | 'block-until-verified';
  readonly rationale: string;
}

export interface CommandWaveStep {
  readonly id: CommandWaveStepId;
  readonly name: string;
  readonly phase: RecoveryCommandPhase;
  readonly commandTemplate: string;
  readonly owner: string;
  readonly estimatedMinutes: number;
  readonly slaMinutes: number;
  readonly criticality: CommandRisk;
  readonly dependencies: readonly CommandExecutionDependency[];
  readonly tags: readonly string[];
  readonly runbookRefs: readonly string[];
}

export type CommandWaveStepId = Brand<string, 'CommandWaveStepId'>;

export interface CommandWave {
  readonly id: ExecutionWaveId;
  readonly planId: CommandPlanId;
  readonly name: string;
  readonly steps: readonly CommandWaveStep[];
  readonly expectedDurationMinutes: number;
  readonly parallelism: number;
  readonly ownerTeam: string;
  readonly isCritical: boolean;
}

export interface CommandPlanProfile {
  readonly id: CommandPlanId;
  readonly surfaceId: CommandSurfaceId;
  readonly intent: 'containment' | 'recovery' | 'mitigation' | 'prevention';
  readonly objectiveSummary: string;
  readonly priority: number;
  readonly riskLevel: CommandRisk;
  readonly waves: readonly CommandWave[];
  readonly createdAt: string;
  readonly owner: string;
  readonly tenant: string;
  readonly labels: readonly string[];
}

export interface CommandSurfaceWindow {
  readonly id: CommandWindowId;
  readonly start: string;
  readonly end: string;
  readonly timezone: string;
  readonly blackoutWindows: readonly { readonly from: string; readonly to: string }[];
  readonly targetRecoveryMinutes: number;
}

export interface CommandSurface {
  readonly id: CommandSurfaceId;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly signals: readonly CommandSignal[];
  readonly availablePlans: readonly CommandPlanProfile[];
  readonly runtimeWindow: CommandSurfaceWindow;
  readonly metadata: {
    readonly owner: string;
    readonly region: string;
    readonly runbookVersion: string;
    readonly environment: 'prod' | 'stage' | 'dev';
  };
}

export interface CommandCandidatePolicy {
  readonly requiresApproval: boolean;
  readonly maxConcurrentCommands: number;
  readonly maxRiskLevel: CommandRisk;
}

export interface CommandSelectionCriteria {
  readonly preferredPhases: readonly RecoveryCommandPhase[];
  readonly maxPlanMinutes: number;
  readonly minConfidence: number;
  readonly riskTolerance: CommandRisk;
  readonly mandatoryTags: readonly string[];
}

export interface CommandCoverageMetric {
  readonly phase: RecoveryCommandPhase;
  readonly coveredStepCount: number;
  readonly totalStepCount: number;
}

export interface CommandOrchestrationResult {
  readonly ok: boolean;
  readonly surface: CommandSurface;
  readonly chosenPlanId: CommandPlanId;
  readonly score: number;
  readonly riskScore: number;
  readonly projectedCompletionAt: string;
  readonly coverage: readonly CommandCoverageMetric[];
  readonly blockers: readonly string[];
}

export interface CommandPolicyViolation {
  readonly code: string;
  readonly reason: string;
  readonly severity: ConstraintTier;
}

export type CommandCandidate = Omit<CommandPlanProfile, 'tenant'> & { readonly surfaceId: CommandSurfaceId };

export type CommandDependencyMatrix = Record<CommandWaveStepId, readonly CommandWaveStepId[]>;

export type CommandPlanDictionary = Record<CommandPlanId, CommandPlanProfile>;

export interface CommandPolicyReport {
  readonly surfaceId: CommandSurfaceId;
  readonly candidateCount: number;
  readonly hardViolations: readonly CommandPolicyViolation[];
  readonly advisoryWarnings: readonly CommandPolicyViolation[];
  readonly gateStatus: 'blocked' | 'open' | 'warn';
}

export interface CommandSurfaceEnvelope {
  readonly surface: CommandSurface;
  readonly policy: CommandCandidatePolicy;
  readonly criteria: CommandSelectionCriteria;
}

export interface WindowViolation {
  readonly reason: string;
  readonly time: string;
}

export interface CommandPlanSummary {
  readonly id: CommandPlanId;
  readonly score: number;
  readonly risk: CommandRisk;
  readonly durationMinutes: number;
}

export type CommandSurfaceQuery = {
  readonly tenantId?: string;
  readonly scenarioId?: string;
  readonly minPriority?: number;
  readonly maxRisk?: CommandRisk;
};

export type RiskIndex = {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
};
