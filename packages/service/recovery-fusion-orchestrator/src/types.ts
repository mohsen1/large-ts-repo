import type {
  FusionBundle,
  FusionBundleId,
  FusionEvaluation,
  FusionPlanResult,
  FusionPlanRequest,
  FusionWave,
} from '@domain/recovery-fusion-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunSession, RecoveryConstraintBudget } from '@domain/recovery-operations-models';
import type { Result } from '@shared/result';

export type { FusionBundleId, FusionWaveId } from '@domain/recovery-fusion-intelligence';

export type FusionOrchestratorState = 'idle' | 'synthesizing' | 'orchestrating' | 'observing' | 'complete' | 'error';

export interface FusionContext {
  readonly tenant: string;
  readonly zone: string;
  readonly owner: string;
  readonly planIdPrefix: string;
}

export interface FusionCoordinatorEnvelope {
  readonly tenant: string;
  readonly planId: string;
  readonly runId: RecoveryRunState['runId'];
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly waves: readonly FusionWave[];
  readonly planResult: FusionPlanResult;
}

export interface FusionStore {
  save(bundle: FusionBundle): Promise<void>;
  get(bundleId: FusionBundleId): Promise<FusionBundle | undefined>;
  list(runId: RecoveryRunState['runId']): Promise<readonly FusionBundle[]>;
}

export interface FusionBus {
  send(payload: unknown): Promise<Result<void, string>>;
  receive(runId: RecoveryRunState['runId']): AsyncIterable<unknown>;
}

export interface FusionMetrics {
  readonly latencyP50: number;
  readonly latencyP90: number;
  readonly commandCount: number;
  readonly evaluationCount: number;
}

export interface FusionPlanCommand {
  readonly runId: RecoveryRunState['runId'];
  readonly targetWaveId: FusionWave['id'];
  readonly command: 'start' | 'pause' | 'resume' | 'abort';
  readonly requestedAt: string;
  readonly reason: string;
}

export interface FusionServiceDeps {
  readonly context: FusionContext;
  readonly store: FusionStore;
  readonly bus: FusionBus;
  readonly strategy?: (bundle: FusionBundle, request: FusionPlanRequest) => Promise<Result<FusionPlanResult, Error>>;
  readonly constraint?: RecoveryConstraintBudget;
}

export interface FusionCycleResult {
  readonly bundleId: string;
  readonly planId: string;
  readonly runId: string;
  readonly accepted: boolean;
  readonly evaluations: readonly FusionEvaluation[];
  readonly snapshots: readonly FusionCoordinatorEnvelope[];
}

export interface FusionLifecycleEvent {
  readonly eventId: string;
  readonly eventType: 'bundle_saved' | 'wave_started' | 'wave_completed' | 'bundle_closed';
  readonly tenant: string;
  readonly bundleId: FusionBundleId;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export type SessionView = Pick<RunSession, 'id' | 'runId' | 'ticketId' | 'status' | 'constraints' | 'signals'>;
