import type {
  CadenceCommand,
  CadenceDraft,
  CadencePlan,
  CadenceRuntimeIntent,
  CadenceWorkspaceState,
  FabricRunSnapshot,
} from '@domain/recovery-fabric-cadence-core';
import type { Result } from '@shared/result';

export type OrchestratorVerb = 'plan' | 'execute' | 'reconcile';

export interface OrchestratorEnvelope {
  readonly workspaceId: string;
  readonly verb: OrchestratorVerb;
  readonly command: CadenceCommand;
  readonly intent: CadenceRuntimeIntent;
}

export interface OrchestratorError {
  readonly code:
    | 'invalid-command'
    | 'validation-failed'
    | 'execution-failed'
    | 'not-found'
    | 'planner-failure';
  readonly message: string;
}

export interface OrchestrationOutcome {
  readonly verb: OrchestratorVerb;
  readonly workspaceId: string;
  readonly draft?: CadenceDraft;
  readonly plan?: CadencePlan;
  readonly state?: CadenceWorkspaceState;
  readonly snapshot?: FabricRunSnapshot;
  readonly metrics: {
    readonly windowCount: number;
    readonly activeSignals: number;
    readonly elapsedMs: number;
  };
}

export interface FabricCadenceOrchestrator {
  loadState(workspaceId: string): Promise<Result<CadenceWorkspaceState, OrchestratorError>>;
  buildDraft(workspaceId: string, command: CadenceCommand): Promise<Result<OrchestrationOutcome, OrchestratorError>>;
  executeDraft(workspaceId: string, draftId: string): Promise<Result<OrchestrationOutcome, OrchestratorError>>;
  closeAll(workspaceId: string): Promise<Result<void, OrchestratorError>>;
}

export interface RuntimeCounters {
  readonly drafted: number;
  readonly executed: number;
  readonly failed: number;
}
