import type { PluginStage, HorizonSignal, JsonLike, HorizonPlan } from '@domain/recovery-horizon-engine';
import type { HorizonStoreRecord, HorizonReadResult } from '@data/recovery-horizon-store';
import type { MeshExecution, MeshHealth, MeshMode } from '@service/recovery-horizon-orchestrator/horizon-mesh.js';

export type OrchestrationMode = MeshMode | 'live' | 'report-only';

export interface RunWindowConfig {
  readonly tenantId: string;
  readonly stages: readonly PluginStage[];
  readonly owner: string;
  readonly mode: OrchestrationMode;
}

export interface OrchestrationPlan {
  readonly id: string;
  readonly title: string;
  readonly window: readonly PluginStage[];
  readonly expectedSignals: number;
}

export interface OrchestrationSeed {
  readonly plan: OrchestrationPlan;
  readonly tags: readonly string[];
  readonly active: boolean;
}

export interface OrchestrationState {
  readonly tenantId: string;
  readonly ready: boolean;
  readonly plan?: HorizonPlan;
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly records: readonly HorizonStoreRecord[];
  readonly runHistory: readonly MeshExecution[];
  readonly meshHealth?: MeshHealth;
  readonly runId?: string;
}

export interface WindowTrend {
  readonly stage: PluginStage;
  readonly count: number;
  readonly ratio: number;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface OrchestrationSummary {
  readonly planId?: string;
  readonly runId?: string;
  readonly signalCount: number;
  readonly recordsCount: number;
  readonly trend: readonly WindowTrend[];
  readonly mode: OrchestrationMode;
}

export type SeedSignal = {
  readonly signal: HorizonSignal<PluginStage, JsonLike>;
  readonly rank: number;
  readonly stage: PluginStage;
};

export type HealthBand = 'green' | 'amber' | 'red';

export interface ReadWindowResult {
  readonly ok: boolean;
  readonly read: HorizonReadResult;
  readonly trend: readonly WindowTrend[];
}
