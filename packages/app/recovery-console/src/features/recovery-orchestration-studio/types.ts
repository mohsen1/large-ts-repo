import type { EngineResult, EngineTick, EngineConfig } from '@service/recovery-orchestration-studio-engine';
import type { RecoveryRunbook, RecoveryScenarioTemplate, StageNode } from '@domain/recovery-orchestration-design';
import { withBrand } from '@shared/core';

export interface StudioWorkspaceSummary {
  readonly tenant: string;
  readonly workspace: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly isHealthy: boolean;
}

export interface StudioConfigForm {
  readonly tenant: string;
  readonly workspace: string;
  readonly limitMs: number;
  readonly tags: readonly string[];
}

export interface StudioUIAction {
  readonly id: 'start' | 'stop' | 'refresh' | 'snapshot';
  readonly at: string;
  readonly payload?: Record<string, unknown>;
}

export interface StudioWorkspaceState {
  readonly loaded: boolean;
  readonly runbook?: RecoveryRunbook;
  readonly template?: RecoveryScenarioTemplate;
  readonly ticks: readonly EngineTick[];
  readonly summary?: StudioWorkspaceSummary;
  readonly isRunning: boolean;
  readonly actions: readonly StudioUIAction[];
}

export type StageSummary = Readonly<Record<StageNode['status'], number>>;

export interface StudioResultPanel {
  readonly result?: EngineResult;
  readonly elapsedMs: number;
  readonly phaseCount: number;
  readonly status: 'idle' | 'starting' | 'running' | 'done' | 'error';
}

export const studioDefaultConfig = {
  tenant: 'acme',
  workspace: 'recovery-playground',
  limitMs: 35_000,
  tags: ['demo', 'lab'],
} satisfies StudioConfigForm;

export const studioConfigToEngine = (config: StudioConfigForm): EngineConfig => ({
  ...config,
  tenant: withBrand(config.tenant, 'EngineTenantId'),
  workspace: withBrand(config.workspace, 'EngineWorkspaceId'),
  limitMs: config.limitMs,
  tags: config.tags,
});
