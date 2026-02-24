import type { CadenceDraft, CadencePlan, CadenceRuntimeIntent, FabricHealth, FabricRunSnapshot } from '@domain/recovery-fabric-cadence-core';
import type { OrchestrationOutcome } from '@service/recovery-fabric-cadence-orchestrator';

export interface FabricCadenceWorkspaceUiState {
  readonly workspaceId: string;
  readonly status: 'idle' | 'loading' | 'ready' | 'running' | 'error';
  readonly activeTab: 'signals' | 'plans' | 'telemetry';
  readonly draft?: CadenceDraft;
  readonly activePlan?: CadencePlan;
  readonly activeIntent?: CadenceRuntimeIntent;
  readonly lastRun?: FabricRunSnapshot;
  readonly health?: FabricHealth;
  readonly outcomes: readonly OrchestrationOutcome[];
  readonly warnings: readonly string[];
}

export interface FabricCadenceUiMetric {
  readonly label: string;
  readonly value: number;
  readonly tone: 'neutral' | 'ok' | 'warn' | 'error';
}
