import type { Brand } from '@shared/type-level';
import type { RecoveryProgram, RecoveryStep, RecoveryPriority } from '@domain/recovery-orchestration';
import type { RecoverySignal, RunSession, RunPlanSnapshot, RunPlanId } from '@domain/recovery-operations-models';

export type ControlPlaneRunId = Brand<string, 'ControlPlaneRunId'>;
export type ControlPlaneEnvelopeId = Brand<string, 'ControlPlaneEnvelopeId'>;
export type ControlPlaneArtifactId = Brand<string, 'ControlPlaneArtifactId'>;
export type ControlPlaneAttempt = Brand<number, 'ControlPlaneAttempt'>;

export type Urgency = 'reactive' | 'planned' | 'defensive';
export type Outcome = 'pending' | 'blocked' | 'in-flight' | 'completed' | 'retriable-fail' | 'terminal-fail';
export type Stage = 'prepare' | 'execute' | 'verify' | 'closeout';
export type ControlCommand = 'snapshot' | 'analyze' | 'gate' | 'deploy' | 'verify' | 'rollback' | 'seal';
export type ConstraintMode = 'strict' | 'monitor' | 'disabled';

export interface TimelineMarker {
  readonly at: string;
  readonly stage: Stage;
  readonly event: string;
  readonly tags: readonly string[];
}

export interface ControlPlaneConstraint {
  readonly kind: ConstraintMode;
  readonly name: string;
  readonly limit: number;
  readonly warningThreshold?: number;
}

export interface ControlPlaneWindow {
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
}

export interface ControlPlaneGateInput {
  readonly tenant: string;
  readonly run: RunSession;
  readonly signals: readonly RecoverySignal[];
  readonly constraints: readonly ControlPlaneConstraint[];
  readonly urgency: Urgency;
}

export interface ControlPlaneCommand<TPayload = unknown> {
  readonly id: Brand<string, 'ControlCommandId'>;
  readonly command: ControlCommand;
  readonly runId: ControlPlaneRunId;
  readonly stepId: RecoveryStep['id'];
  readonly payload?: TPayload;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface ControlPlaneCheckpoint {
  readonly id: ControlPlaneArtifactId;
  readonly runId: ControlPlaneRunId;
  readonly commandId: Brand<string, 'ControlCommandId'>;
  readonly stage: Stage;
  readonly status: Outcome;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly details?: Record<string, unknown>;
}

export interface ControlPlaneEdge {
  readonly from: RecoveryStep['id'];
  readonly to: RecoveryStep['id'];
  readonly weight: number;
}

export interface ControlPlaneGraph {
  readonly runId: ControlPlaneRunId;
  readonly nodes: readonly RecoveryStep['id'][];
  readonly edges: readonly ControlPlaneEdge[];
  readonly rootNodes: readonly RecoveryStep['id'][];
  readonly terminalNodes: readonly RecoveryStep['id'][];
}

export interface ControlPlanePlanInput {
  readonly runId: RunPlanId;
  readonly program: RecoveryProgram;
  readonly snapshot: RunPlanSnapshot;
  readonly window: ControlPlaneWindow;
  readonly priority: RecoveryPriority;
  readonly tenant: string;
  readonly urgency?: Urgency;
}

export interface ControlPlanePlan {
  readonly id: ControlPlaneRunId;
  readonly programId: RecoveryProgram['id'];
  readonly snapshotId: RunPlanSnapshot['id'];
  readonly commands: readonly ControlPlaneCommand[];
  readonly graph: ControlPlaneGraph;
  readonly gates: readonly string[];
  readonly window: ControlPlaneWindow;
}

export interface ControlPlaneManifest {
  readonly envelopeId: ControlPlaneEnvelopeId;
  readonly tenant: string;
  readonly run: ControlPlaneRunId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly plan: ControlPlanePlan;
  readonly checkpoints: readonly ControlPlaneCheckpoint[];
  readonly timeline: readonly TimelineMarker[];
}

export interface ControlPlaneAdapterContext {
  readonly tenant: string;
  readonly version: string;
  readonly featureFlags: Record<string, boolean>;
}

export type ConstraintEvaluator<TContext extends ControlPlaneGateInput = ControlPlaneGateInput, TDecision = boolean> = (
  context: TContext,
) => Promise<TDecision> | TDecision;

export type ConstraintMap<TContext extends ControlPlaneGateInput, TDecision = boolean> = {
  readonly [name: string]: ConstraintEvaluator<TContext, TDecision>;
};

export interface ConstraintResult {
  readonly name: string;
  readonly mode: ConstraintMode;
  readonly passed: boolean;
  readonly details: string;
  readonly confidence: number;
}

export interface ScheduleWindow {
  readonly label: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface PlanSchedule {
  readonly planId: RunPlanId;
  readonly windows: readonly ScheduleWindow[];
  readonly cadenceMinutes: number;
}

export interface ControlPlaneRoute {
  readonly routeId: string;
  readonly topic: string;
  readonly tenant: string;
  readonly payload: unknown;
}
