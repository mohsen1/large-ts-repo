import type {
  PluginStage,
  HorizonPlan,
  PluginContract,
  PluginConfig,
  JsonLike,
  HorizonSignal,
  TimeMs,
  ValidateHorizonTag,
  PlanId,
} from '@domain/recovery-horizon-engine';
import type {
  HorizonLookupConfig,
  HorizonReadResult,
  HorizonMutationEvent,
  HorizonStoreRecord,
} from '@data/recovery-horizon-store';
import type {
  HorizonOrchestratorConfig,
  HorizonServiceSnapshot,
  HorizonServiceStats,
  StageReport,
  HorizonRunContext,
  HorizonRunnerContract,
} from '@service/recovery-horizon-orchestrator';

export type HorizonTag<T extends string = string> = ValidateHorizonTag<T>;

export type StageTag<T extends PluginStage> = T | `${Uppercase<T>}_TAG`;

export interface HorizonWorkspaceFilters {
  readonly tenantId: string;
  readonly stages: readonly PluginStage[];
  readonly includeArchived: boolean;
  readonly includeDiagnostics: boolean;
}

export interface HorizonLabState {
  readonly config: HorizonOrchestratorConfig;
  readonly loading: boolean;
  readonly lastQuery: HorizonWorkspaceFilters;
  readonly snapshots: readonly HorizonWorkspaceFilters[];
  readonly plans: readonly HorizonPlan[];
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly events: readonly HorizonMutationEvent[];
  readonly selectedPlanId?: PlanId;
  readonly selectedSignalKind: PluginStage | 'all';
  readonly elapsedMs: TimeMs;
}

export interface HorizonLabActions {
  readonly refresh: (tenantId: string) => Promise<void>;
  readonly run: (plan: HorizonPlan) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly applyFilters: (filters: Partial<HorizonWorkspaceFilters>) => void;
  readonly selectPlan: (planId?: PlanId) => void;
}

export interface HorizonWorkspace {
  readonly state: HorizonLabState;
  readonly actions: HorizonLabActions;
  readonly report: StageReport | undefined;
  readonly snapshot: HorizonServiceSnapshot | undefined;
  readonly stats: HorizonServiceStats | undefined;
  readonly queryResult: HorizonReadResult | undefined;
  readonly runner: HorizonRunnerContract;
}

export interface HorizonSignalRow {
  readonly id: string;
  readonly tenant: string;
  readonly stage: PluginStage;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly startedAt: string;
  readonly ageMs: number;
  readonly tags: readonly string[];
}

export interface HorizonPlanDraft {
  readonly name: string;
  readonly stageWindow: readonly PluginStage[];
  readonly owner: string;
  readonly tenantId: string;
}

export interface HorizonEngineConfig {
  readonly stageOptions: readonly StageTag<PluginStage>[];
  readonly contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[];
  readonly autoRun: boolean;
  readonly runDelayMs: number;
  readonly labelFormatter: (signal: HorizonStoreRecord) => string;
}
