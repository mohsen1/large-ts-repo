import type { Brand } from '@shared/type-level';
import type { ScenarioRunId, StageKind, StageStatus } from '@domain/recovery-scenario-design';

export type ScenarioNodeId = Brand<string, 'ScenarioNodeId'>;
export type ScenarioRunState = 'building' | 'deploying' | 'running' | 'monitoring' | 'finished';
export type ScenarioEngineMode = 'analysis' | 'simulation' | 'execution' | 'chaos';

export interface ScenarioStageSpec {
  readonly id: ScenarioNodeId;
  readonly name: string;
  readonly kind: StageKind;
  readonly status: StageStatus;
  readonly summary: string;
  readonly confidence: number;
}

export interface ScenarioTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly stages: readonly ScenarioStageSpec[];
  readonly createdAt: string;
  readonly owner: string;
}

export interface ScenarioRunSnapshot {
  readonly runId: ScenarioRunId;
  readonly templateId: string;
  readonly state: ScenarioRunState;
  readonly mode: ScenarioEngineMode;
  readonly startedAt: string;
  readonly progress: number;
  readonly stagesComplete: number;
  readonly durationMs: number;
  readonly stageStats: readonly {
    readonly stageId: ScenarioNodeId;
    readonly latencyMs: number;
    readonly status: StageStatus;
  }[];
}

export interface ScenarioStudioModel {
  readonly templates: readonly ScenarioTemplate[];
  readonly selectedTemplateId: string | null;
  readonly selectedRunId: ScenarioRunId | null;
  readonly currentMode: ScenarioEngineMode;
}

export interface ScenarioWorkspaceState {
  readonly model: ScenarioStudioModel;
  readonly history: readonly string[];
  readonly runningRuns: readonly ScenarioRunSnapshot[];
}

export interface ScenarioStudioInput {
  readonly templateId: string;
  readonly owner: string;
  readonly mode: ScenarioEngineMode;
  readonly parameters: Record<string, unknown>;
}

export interface ScenarioStudioServiceResponse {
  readonly ok: boolean;
  readonly payload?: ScenarioRunSnapshot;
  readonly error?: string;
}

export const engineModes = ['analysis', 'simulation', 'execution', 'chaos'] as const satisfies readonly ScenarioEngineMode[];
