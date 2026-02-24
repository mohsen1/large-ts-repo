import type { NoInfer } from '@shared/type-level';
import type {
  LabExecution,
  LabExecutionContext,
  LabExecutionResult,
  LabPlanTemplate,
  LabScenario,
  LabLane,
  RuntimeSignalBag,
  ScenarioSignal,
} from '@domain/recovery-simulation-lab-core';
import type { RecoveryLabStore } from '@data/recovery-lab-simulation-store';
import type { LabRunId } from '@shared/recovery-lab-kernel';

export interface OrchestratorConfig {
  readonly tenant: string;
  readonly workspace: string;
  readonly lane: LabLane;
  readonly dryRun?: boolean;
}

export interface RunRequest {
  readonly tenant: string;
  readonly scenarioId: string;
  readonly planId?: string;
  readonly context: LabExecutionContext;
  readonly lane: LabLane;
  readonly tags?: readonly string[];
}

export interface RunResult {
  readonly executionId: LabRunId;
  readonly output: LabExecutionResult;
  readonly stageLatenciesMs: ReadonlyMap<string, number>;
  readonly pluginCount: number;
}

export interface RunObserver {
  onEvent(event: string, payload: Record<string, unknown>): void;
}

export interface OrchestrationServices {
  readonly store: RecoveryLabStore;
  readonly executeScenario: (scenario: LabScenario, plan: LabPlanTemplate | null, config: OrchestratorConfig) => Promise<LabExecution>;
  readonly evaluateSignals: (bag: NoInfer<RuntimeSignalBag<readonly ScenarioSignal[]>>) => Promise<number>;
}

export interface PluginRuntime {
  readonly id: string;
  readonly kind: string;
  readonly run: (input: unknown, context: unknown) => Promise<unknown>;
  readonly health: () => number;
}

export const emptyObserver: RunObserver = {
  onEvent: () => {
    return void 0;
  },
};
