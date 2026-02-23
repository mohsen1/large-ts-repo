import { Brand } from '@shared/core';
import type { ReadinessRunbookExecution, ReadinessSignal, ReadinessWindow } from '@domain/recovery-readiness';

export type CommandNetworkId = Brand<string, 'CommandNetworkId'>;
export type CommandNetworkNodeId = Brand<string, 'CommandNetworkNodeId'>;
export type CommandNetworkEdgeId = Brand<string, 'CommandNetworkEdgeId'>;
export type CommandChannelId = Brand<string, 'CommandChannelId'>;
export type CommandPolicyId = Brand<string, 'CommandPolicyId'>;

export type Criticality = 'low' | 'medium' | 'high' | 'critical';
export type NodeRole = 'ingest' | 'plan' | 'simulate' | 'execute' | 'audit';
export type DriftSignal = 'improving' | 'neutral' | 'degrading';
export type WindowPhase = 'queued' | 'active' | 'suppressed' | 'completed' | 'failed';

export interface CommandNodeMeta {
  readonly owner: string;
  readonly region: string;
  readonly availabilitySloMinutes: number;
  readonly maxInFlight: number;
  readonly contact: string;
  readonly criticality: Criticality;
}

export interface CommandEdgeMeta {
  readonly capacity: number;
  readonly latencyMsP95: number;
  readonly errorRatePercent: number;
  readonly encrypted: boolean;
  readonly protocol: 'grpc' | 'http' | 'stream';
}

export interface CommandNetworkNode {
  readonly nodeId: CommandNetworkNodeId;
  readonly label: string;
  readonly role: NodeRole;
  readonly state: WindowPhase;
  readonly readinessSignalIds: readonly ReadinessSignal['signalId'][];
  readonly signals: readonly ReadinessSignal[];
  readonly windows: readonly ReadinessWindow[];
  readonly metadata: CommandNodeMeta;
}

export interface CommandNetworkEdge {
  readonly edgeId: CommandNetworkEdgeId;
  readonly from: CommandNetworkNodeId;
  readonly to: CommandNetworkNodeId;
  readonly channelId: CommandChannelId;
  readonly direction: 'unidirectional' | 'bidirectional';
  readonly confidence: number;
  readonly policyWeight: number;
  readonly constraints: readonly string[];
  readonly meta: CommandEdgeMeta;
}

export interface CommandWave {
  readonly waveIndex: number;
  readonly nodeIds: readonly CommandNetworkNodeId[];
  readonly startAt: string;
  readonly deadlineAt: string;
  readonly commandCount: number;
  readonly readinessWindow: ReadinessWindow;
}

export interface PolicyRule {
  readonly policyId: CommandPolicyId;
  readonly name: string;
  readonly enabled: boolean;
  readonly windowHours: number;
  readonly allowedRoles: readonly NodeRole[];
  readonly maxLatencyMs: number;
  readonly requireAudit: boolean;
  readonly channels: readonly CommandChannelId[];
}

export type CommandPolicy = PolicyRule;

export interface DriftObservation {
  readonly at: string;
  readonly drift: DriftSignal;
  readonly scoreDelta: number;
  readonly policyId: CommandPolicyId;
  readonly reason: string;
}

export interface PlanWindow {
  readonly windowId: Brand<string, 'CommandPlanWindowId'>;
  readonly fromUtc: string;
  readonly toUtc: string;
  readonly runbooks: readonly ReadinessRunbookExecution[];
  readonly expectedDurationMinutes: number;
  readonly notes: readonly string[];
}

export interface RuntimeIntent {
  readonly intentId: Brand<string, 'RuntimeIntentId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runbookRunId: ReadinessRunbookExecution['executionId'];
  readonly commandNetworkId: CommandNetworkId;
  readonly targetWindow: PlanWindow;
  readonly priority: Criticality;
  readonly isEmergency: boolean;
  readonly waves: readonly CommandWave[];
  readonly createdAt: string;
}

export interface CommandNetworkSnapshot {
  readonly networkId: CommandNetworkId;
  readonly timestamp: string;
  readonly nodes: readonly CommandNetworkNode[];
  readonly edges: readonly CommandNetworkEdge[];
  readonly policies: readonly PolicyRule[];
  readonly waves: readonly CommandWave[];
  readonly drifts: readonly DriftObservation[];
  readonly activeRunbookExecution: ReadinessRunbookExecution | null;
}

export interface SignalEnvelope<T> {
  readonly envelopeId: Brand<string, 'SignalEnvelopeId'>;
  readonly sourceNode: CommandNetworkNodeId;
  readonly emittedAt: string;
  readonly payload: T;
  readonly confidence: number;
  readonly tags: readonly string[];
}

export interface RoutingDecision {
  readonly nodeId: CommandNetworkNodeId;
  readonly policyId: CommandPolicyId;
  readonly accepted: boolean;
  readonly reason: string;
  readonly score: number;
}

export interface CommandGraph {
  readonly networkId: CommandNetworkId;
  readonly nodesByRole: Record<NodeRole, readonly CommandNetworkNodeId[]>;
  readonly adjacency: Readonly<Record<CommandNetworkNodeId, readonly CommandNetworkEdge[]>>;
  readonly activePolicyIds: readonly CommandPolicyId[];
}
