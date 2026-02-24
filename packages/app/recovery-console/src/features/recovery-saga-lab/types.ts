import type { ResultState } from '@shared/core';
import type { ScenarioBundle, SagaRun, SagaPolicy, SagaPlan } from '@domain/recovery-incident-saga';
import type { SagaRuntimeSnapshot } from '@service/recovery-incident-saga-orchestrator';

export type SagaTab = 'timeline' | 'topology' | 'policies' | 'events';

export interface SagaPluginStatus {
  readonly plugin: string;
  readonly enabled: boolean;
  readonly status: 'running' | 'stopped';
}

export interface SagaWorkspaceState {
  readonly run?: SagaRun;
  readonly plan?: SagaPlan;
  readonly policy?: SagaPolicy;
  readonly bundle?: ScenarioBundle;
  readonly runtime?: SagaRuntimeSnapshot;
  readonly selectedTab: SagaTab;
  readonly pluginStatus: readonly SagaPluginStatus[];
  readonly lastSummary: string;
  readonly loading: boolean;
  readonly error?: string;
}

export interface SagaAction {
  readonly type: 'start' | 'stop' | 'select' | 'refresh';
  readonly payload?: unknown;
}

export interface SagaWorkspaceAction extends SagaAction {
  readonly type: 'start' | 'stop' | 'select' | 'refresh';
}

export type SagaWorkspaceDispatcher = (action: SagaWorkspaceAction) => void;

export interface SagaWorkspaceResult {
  readonly ok: boolean;
  readonly runCount: number;
  readonly warningCount: number;
  readonly summary: string;
}

export interface SagaWorkspaceOutcome {
  readonly bundle: ScenarioBundle;
  readonly result: ResultState<SagaWorkspaceResult, string>;
  readonly startedAt: string;
}

export interface SagaWorkspaceDiagnostics {
  readonly runtimeSummary: string;
  readonly pluginLabels: readonly string[];
  readonly eventCount: number;
}
