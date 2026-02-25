import type {
  OrchestrationDiagnostic,
  OrchestrationPolicy,
  OrchestratedRun,
  OrchestrationWorkspace,
} from '@domain/recovery-chronicle-orchestrator';
import type { ChroniclePriority } from '@domain/recovery-chronicle-core';

export interface ChronicleWorkspaceSnapshot {
  readonly policy: OrchestrationPolicy;
  readonly run?: OrchestratedRun;
  readonly workspace?: OrchestrationWorkspace;
  readonly diagnostics: readonly OrchestrationDiagnostic[];
  readonly isRunning: boolean;
  readonly status: 'idle' | 'running' | 'error';
}

export interface PolicyPatch {
  readonly maxParallelism: number;
  readonly minConfidence: number;
  readonly allowedTiers: readonly ChroniclePriority[];
  readonly mode: 'strict' | 'adaptive' | 'simulated';
}

export interface PolicyPatchEvent {
  readonly patch: PolicyPatch;
  readonly isValid: boolean;
  readonly warnings: readonly string[];
}
