import type { Brand } from '@shared/core';
import type { DeepMerge, Merge } from '@shared/type-level';
import type { RecoveryProgram, RecoveryStep, RecoveryTopology } from '@domain/recovery-orchestration';

export type CommandStudioWorkspaceId = Brand<string, 'CommandStudioWorkspaceId'>;
export type CommandStudioRunId = Brand<string, 'CommandStudioRunId'>;
export type CommandStudioCommandId = Brand<string, 'CommandStudioCommandId'>;
export type CommandStudioArtifactId = Brand<string, 'CommandStudioArtifactId'>;

export type CommandSeverity = 'info' | 'notice' | 'warning' | 'critical';
export type CommandDirection = 'inbound' | 'outbound' | 'bidirectional';
export type CommandWindowState = 'draft' | 'queued' | 'active' | 'suspended' | 'complete' | 'failed';
export type CommandAction = 'approve' | 'delay' | 'reroute' | 'escalate' | 'rollback';

export interface TimeWindow {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
}

export interface CommandSignal {
  readonly signalId: Brand<string, 'SignalId'>;
  readonly source: string;
  readonly direction: CommandDirection;
  readonly severity: number;
  readonly confidence: number;
  readonly summary: string;
  readonly observedAt: string;
}

export interface CommandIntent {
  readonly intentId: Brand<string, 'IntentId'>;
  readonly commandId: CommandStudioCommandId;
  readonly title: string;
  readonly rationale: readonly string[];
  readonly urgency: number;
  readonly tags: readonly string[];
}

export interface CommandNode {
  readonly id: CommandStudioCommandId;
  readonly stepId: string;
  readonly name: string;
  readonly owner: string;
  readonly state: CommandWindowState;
  readonly step: RecoveryStep;
  readonly commands: readonly CommandAction[];
}

export interface CommandLane {
  readonly laneId: Brand<string, 'LaneId'>;
  readonly name: string;
  readonly nodeIds: readonly CommandStudioCommandId[];
  readonly capacity: number;
}

export interface CommandSequence {
  readonly sequenceId: Brand<string, 'SequenceId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly name: string;
  readonly window: TimeWindow;
  readonly lanes: readonly CommandLane[];
  readonly nodes: readonly CommandNode[];
  readonly signals: readonly CommandSignal[];
  readonly readinessScore: number;
  readonly risk: number;
}

export interface SequenceIntentMap {
  readonly sequenceId: CommandStudioWorkspaceId;
  readonly mapping: readonly {
    readonly commandId: CommandStudioCommandId;
    readonly intentIds: readonly CommandIntent['intentId'][];
  }[];
}

export interface SequencePolicy {
  readonly policyId: Brand<string, 'PolicyId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly maxInflight: number;
  readonly maxRollbackRetries: number;
  readonly autoPauseOnCritical: boolean;
  readonly allowedActions: readonly CommandAction[];
}

export interface CommandRun {
  readonly runId: CommandStudioRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly planId: RecoveryProgram['id'];
  readonly sequenceId: CommandSequence['sequenceId'];
  readonly state: CommandWindowState;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly activeNodeId?: CommandStudioCommandId;
  readonly completedNodeIds: readonly CommandStudioCommandId[];
}

export interface CommandArtifact {
  readonly artifactId: CommandStudioArtifactId;
  readonly runId: CommandStudioRunId;
  readonly category: 'evidence' | 'metric' | 'checkpoint' | 'audit';
  readonly severity: CommandSeverity;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface OrchestrationResult {
  readonly ok: boolean;
  readonly warningCount: number;
  readonly estimatedMinutes: number;
  readonly confidence: number;
}

export interface StudioEnvelope<TPayload extends Record<string, unknown>> {
  readonly envelopeId: Brand<string, 'StudioEnvelopeId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly payloadType: string;
  readonly issuedAt: string;
  readonly payload: TPayload;
}

export interface CommandMetric {
  readonly metricId: Brand<string, 'MetricId'>;
  readonly commandId: CommandStudioCommandId;
  readonly label: string;
  readonly value: number;
  readonly unit: 'ms' | 'percent' | 'count';
}

export interface CommandEvaluationContext {
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly topology: RecoveryTopology;
  readonly policy: SequencePolicy;
  readonly currentLoad: number;
}

export interface CommandSimulationStep {
  readonly index: number;
  readonly commandId: CommandStudioCommandId;
  readonly expectedStart: string;
  readonly expectedFinish: string;
  readonly metrics: readonly CommandMetric[];
  readonly blockers: readonly string[];
}

export interface CommandSimulation {
  readonly simulationId: Brand<string, 'SimulationId'>;
  readonly sequenceId: CommandSequence['sequenceId'];
  readonly createdAt: string;
  readonly steps: readonly CommandSimulationStep[];
  readonly horizonMs: number;
  readonly outcome: OrchestrationResult;
}

export interface StudioSummary {
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly runId: CommandStudioRunId;
  readonly title: string;
  readonly state: CommandWindowState;
  readonly totalSignals: number;
  readonly topSignal: string;
  readonly throughput: number;
}

export type StudioRuntimeState = Merge<
  {
    readonly sequences: readonly CommandSequence[];
    readonly runs: readonly CommandRun[];
    readonly simulations: readonly CommandSimulation[];
    readonly metrics: readonly CommandMetric[];
  },
  {
    readonly latestIntentMap?: SequenceIntentMap;
    readonly activeRun?: CommandRun;
    readonly selectedSequenceId?: CommandSequence['sequenceId'];
  }
>;

export type ResolvedStudioState = DeepMerge<StudioRuntimeState, {
  readonly activeRun: CommandRun;
}>;

export interface AdapterMessage<TPayload> {
  readonly id: Brand<string, 'AdapterMessageId'>;
  readonly eventType: string;
  readonly data: TPayload;
  readonly trace: ReadonlyArray<string>;
}

export interface CommandStudioPlan {
  readonly id: Brand<string, 'StudioPlanId'>;
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly label: string;
  readonly version: number;
  readonly baselineSequence: CommandSequence;
  readonly plannedAt: string;
  readonly modifiedAt: string;
}
