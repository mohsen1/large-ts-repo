import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { IncidentId } from '@domain/recovery-incident-orchestration';
import type {
  RecoverySignal,
  RecoveryConstraintBudget,
  RunPlanId,
  RunSession,
} from '@domain/recovery-operations-models';
import type { Brand } from '@shared/type-level';

export type FusionWaveId = string;
export type FusionBundleId = string;
export type FusionSignalId = string;
export type FusionCommandId = string;
export type FusionPlanId = RunPlanId;

export type FusionRiskBand = 'green' | 'amber' | 'red' | 'critical';
export type FusionReadinessState = 'idle' | 'warming' | 'running' | 'blocked' | 'degraded' | 'stable' | 'failed';

export interface FusionWeightVector {
  readonly severity: number;
  readonly confidence: number;
  readonly temporalUrgency: number;
  readonly blastRadius: number;
  readonly dependencyDepth: number;
  readonly operatorSlack: number;
}

export interface FusionSignal extends RecoverySignal {
  readonly id: FusionSignalId;
  readonly runId: RecoveryRunState['runId'];
  readonly incidentId?: IncidentId;
  readonly tags: readonly string[];
  readonly payload: Record<string, unknown>;
  readonly observedAt: string;
  readonly details: Record<string, unknown>;
}

export type FusionSignalEnvelope = FusionSignal;

export interface FusionCommand {
  readonly id: FusionCommandId;
  readonly waveId: FusionWaveId;
  readonly stepKey: string;
  readonly action: 'start' | 'pause' | 'resume' | 'abort' | 'verify';
  readonly actor: string;
  readonly requestedAt: string;
  readonly rationale: string;
}

export interface FusionWave {
  readonly id: FusionWaveId;
  readonly planId: FusionPlanId;
  readonly runId: RecoveryRunState['runId'];
  readonly state: FusionReadinessState;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly commands: readonly FusionCommand[];
  readonly readinessSignals: readonly FusionSignal[];
  readonly budget: RecoveryConstraintBudget;
  readonly riskBand: FusionRiskBand;
  readonly score: number;
  readonly metadata: {
    readonly createdBy: string;
    readonly priority: number;
    readonly confidence: number;
    readonly ownerTeam: string;
  };
}

export interface FusionBundle {
  readonly id: FusionBundleId;
  readonly tenant: string;
  readonly runId: RecoveryRunState['runId'];
  readonly session: RunSession;
  readonly planId: FusionPlanId;
  readonly waves: readonly FusionWave[];
  readonly signals: readonly FusionSignal[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface FusionPlanRequest {
  readonly planId: FusionPlanId;
  readonly runId: RecoveryRunState['runId'];
  readonly waves: readonly FusionWave[];
  readonly signals: readonly FusionSignalEnvelope[];
  readonly budget: RecoveryConstraintBudget;
}

export interface FusionPlanResult {
  readonly accepted: boolean;
  readonly bundleId: FusionBundleId;
  readonly waveCount: number;
  readonly estimatedMinutes: number;
  readonly riskBand: FusionRiskBand;
  readonly reasons: readonly string[];
}

export interface FusionEvaluation {
  readonly bundleId: FusionBundleId;
  readonly score: number;
  readonly severity: number;
  readonly confidence: number;
  readonly readinessDelta: number;
  readonly signals: readonly FusionSignal[];
  readonly recommended: readonly FusionCommand[];
}

export interface FusionTopologyNode {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly parents: readonly string[];
  readonly children: readonly string[];
}

export interface FusionTopologyEdge {
  readonly from: string;
  readonly to: string;
  readonly latencyMs: number;
  readonly riskPenalty: number;
}

export interface FusionTopology {
  readonly nodes: readonly FusionTopologyNode[];
  readonly edges: readonly FusionTopologyEdge[];
}

export interface FusionTopologyMetrics {
  readonly diameter: number;
  readonly density: number;
  readonly centralityHotspots: readonly string[];
  readonly averageLatencyMs: number;
}

export interface FusionEnvelope<TPayload> {
  readonly eventId: Brand<string, 'FusionEventId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly signature: string;
}

export interface FusionPlanCommand {
  readonly runId: RecoveryRunState['runId'];
  readonly targetWaveId: FusionWaveId;
  readonly command: 'start' | 'pause' | 'resume' | 'abort';
  readonly requestedAt: string;
  readonly reason: string;
}
