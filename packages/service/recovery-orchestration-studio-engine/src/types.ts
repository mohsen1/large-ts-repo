import { type Branded } from '@shared/orchestration-kernel';

export type EngineExecutionId = Branded<string, 'EngineExecutionId'>;
export type EngineTenantId = Branded<string, 'EngineTenantId'>;
export type EngineWorkspaceId = Branded<string, 'EngineWorkspaceId'>;
export type EngineRunId = Branded<string, 'EngineRunId'>;

export type RuntimePhase = 'boot' | 'planning' | 'execution' | 'observation' | 'complete' | 'error';
export type RuntimeStatus = 'idle' | 'running' | 'blocked' | 'finished' | 'failed';

export interface EngineConfig {
  readonly tenant: EngineTenantId;
  readonly workspace: EngineWorkspaceId;
  readonly limitMs: number;
  readonly tags: readonly string[];
}

export interface EngineTick {
  readonly at: string;
  readonly pluginId: string;
  readonly phase: RuntimePhase;
  readonly status: RuntimeStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface EngineResult {
  readonly executionId: EngineExecutionId;
  readonly tenant: EngineTenantId;
  readonly workspace: EngineWorkspaceId;
  readonly ticks: readonly EngineTick[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface EngineWorkload {
  readonly workspace: EngineWorkspaceId;
  readonly planId: Branded<string, 'WorkloadPlanId'>;
  readonly scenarioId: Branded<string, 'WorkloadScenarioId'>;
  readonly requestedAt: string;
}

export type NoopBrand<T, B extends string> = Branded<T, B>;
