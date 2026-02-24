import { type NoInfer } from '@shared/type-level';
import {
  type LatticeBlueprintManifest,
  type LatticeContext,
  type LatticeRouteId,
  type LatticeTenantId,
  type StageDefinition,
  type StageKind,
} from '@domain/recovery-lattice';
import type { LatticeSnapshotRecord } from '@data/recovery-lattice-orchestrator-store';
import type { Result } from '@shared/result';

export type LatticeOperationStatus =
  | 'queued'
  | 'priming'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted';

export type LatticeOrchestratorMode = 'analysis' | 'validation' | 'execution' | 'rehearsal';

export interface LatticeOrchestratorRequest<TPayload = unknown> {
  readonly tenantId: LatticeTenantId;
  readonly routeId: LatticeRouteId;
  readonly mode: LatticeOrchestratorMode;
  readonly blueprint: LatticeBlueprintManifest;
  readonly payload: TPayload;
  readonly context?: LatticeContext;
}

export interface LatticeOrchestratorResult {
  readonly status: LatticeOperationStatus;
  readonly routeId: LatticeRouteId;
  readonly trace: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly error?: string;
}

export interface LatticeExecutionLog {
  readonly id: string;
  readonly status: LatticeOrchestratorStatus;
  readonly routeId: LatticeRouteId;
  readonly events: readonly string[];
  readonly durationMs: number;
}

export type LatticeOrchestratorStatus =
  | 'initialized'
  | 'executing'
  | 'validation_passed'
  | 'validation_failed'
  | 'complete';

export interface LatticeOrchestratorEvent {
  readonly id: string;
  readonly at: string;
  readonly type: 'stage.started' | 'stage.finished' | 'stage.failed' | 'finalized';
  readonly details: Record<string, unknown>;
}

export interface LatticeOrchestratorState {
  readonly tenantId: LatticeTenantId;
  readonly requestId: string;
  readonly mode: LatticeOrchestratorMode;
  readonly context: LatticeContext;
  readonly status: LatticeOrchestratorStatus;
  readonly logs: readonly LatticeOrchestratorEvent[];
}

export type RunTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? readonly [Head, ...RunTuple<Tail>]
    : readonly [];

export interface LatticeSessionHandle {
  readonly id: string;
  readonly stop: () => Promise<boolean>;
  readonly state: LatticeOrchestratorState;
}

export interface LatticeSimConfig {
  readonly limit: number;
  readonly iterations: number;
  readonly strictMode: boolean;
}

export interface LatticePlanResult {
  readonly blueprint: LatticeBlueprintManifest;
  readonly route: string;
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
  readonly snapshot: LatticeSnapshotRecord | null;
}

export type StageResult<TInput, TOutput = TInput> = {
  readonly input: TInput;
  readonly output: TOutput;
};

export type StageRunner<TInput, TOutput = TInput> = (
  input: TInput,
  context: LatticeContext,
) => Promise<StageResult<TInput, TOutput>>;

export interface LatticePipeline<TInput = unknown, TOutput = unknown> {
  readonly stages: readonly StageDefinition<TInput, StageKind>[];
  execute(input: NoInfer<TInput>): Promise<TOutput>;
}

export type WithResult<TSuccess, TFail = Error> = Result<TSuccess, TFail>;
