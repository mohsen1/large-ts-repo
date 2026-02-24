import type {
  HorizonSignal,
  HorizonInput,
  HorizonPlan,
  PluginConfig,
  PluginStage,
  RunId,
  PlanId,
  TimeMs,
  ValidationResult,
  JsonLike,
} from '@domain/recovery-horizon-engine';

export type { HorizonPlan };

export interface HorizonStoreRecord {
  readonly id: PlanId;
  readonly tenantId: string;
  readonly runId: RunId;
  readonly updatedAt: TimeMs;
  readonly signal: HorizonSignal<PluginStage, JsonLike>;
  readonly plan?: HorizonPlan;
}

export interface HorizonStoreSnapshot {
  readonly tenantId: string;
  readonly takenAt: TimeMs;
  readonly records: readonly HorizonStoreRecord[];
}

export interface HorizonMutationEvent {
  readonly kind: 'upsert' | 'delete' | 'archive';
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly runId: RunId;
  readonly at: TimeMs;
}

export interface HorizonLookupConfig {
  readonly tenantId: string;
  readonly includeArchived?: boolean;
  readonly stages?: readonly PluginStage[];
  readonly maxRows?: number;
}

export interface HorizonWriteArgs {
  readonly tenantId: string;
  readonly signal: HorizonSignal<PluginStage, JsonLike>;
  readonly plan?: HorizonPlan;
}

export interface HorizonReadResult {
  readonly items: readonly HorizonStoreRecord[];
  readonly total: number;
  readonly cursor?: string;
}

export interface HorizonSignalEnvelope {
  readonly payload: HorizonSignal<PluginStage, JsonLike>;
  readonly context: {
    readonly runId: RunId;
    readonly pluginKind: PluginStage;
    readonly tenantId: string;
  };
}

export interface HorizonPlanEnvelope {
  readonly plan: HorizonPlan;
  readonly config: PluginConfig<PluginStage, JsonLike>;
}

export type ValidatedSignal = ValidationResult<HorizonSignal<PluginStage, JsonLike>>;

export interface HorizonHistoryWindow {
  readonly minTime: TimeMs;
  readonly maxTime: TimeMs;
  readonly events: readonly HorizonMutationEvent[];
}
