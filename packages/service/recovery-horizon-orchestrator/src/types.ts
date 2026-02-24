import type {
  PluginStage,
  HorizonPlan,
  HorizonSignal,
  ValidationResult,
  PluginConfig,
  JsonLike,
  TimeMs,
  RunId,
  PlanId,
} from '@domain/recovery-horizon-engine';
import type {
  HorizonLookupConfig,
  HorizonReadResult,
  HorizonMutationEvent,
  HorizonStoreRecord,
} from '@data/recovery-horizon-store';

export type { PlanId };
export type { ValidationResult };

type NoInfer<T> = [T] extends [infer U] ? U : never;

export type RuntimeState = 'idle' | 'warming' | 'running' | 'draining' | 'failed' | 'completed';

export interface HorizonOrchestratorConfig {
  readonly tenantId: string;
  readonly planName: string;
  readonly stageWindow: readonly PluginStage[];
  readonly refreshIntervalMs: number;
  readonly tags: readonly string[];
  readonly owner: string;
}

export interface HorizonRunContext {
  readonly runId: RunId;
  readonly startedAt: TimeMs;
  readonly state: RuntimeState;
  readonly lastError?: string;
  readonly stageWindow: readonly PluginStage[];
}

export interface HorizonOrchestratorResult {
  readonly ok: boolean;
  readonly runId: RunId;
  readonly elapsedMs: TimeMs;
  readonly stages: readonly StageResult[];
}

export interface HorizonQuery {
  readonly tenantId: string;
  readonly includeArchived?: boolean;
  readonly maxRows?: number;
}

export interface HorizonServiceSnapshot {
  readonly tenantId: string;
  readonly state: HorizonRunContext;
  readonly latest: {
    readonly plans: readonly HorizonPlan[];
    readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  };
}

export interface HorizonBatchSpec<TKind extends PluginStage> {
  readonly config: PluginConfig<TKind, JsonLike>;
  readonly signals: readonly HorizonSignal<TKind, JsonLike>[];
}

export interface HorizonExecutionWindow {
  readonly query: HorizonLookupConfig;
  readonly startedAt: TimeMs;
  readonly endedAt: TimeMs;
  readonly signalCount: number;
  readonly planIds: readonly PlanId[];
}

export interface HorizonServiceStats {
  readonly totalPlans: number;
  readonly stageMix: { [K in PluginStage]?: number };
  readonly mutationCount: number;
}

export interface HorizonRunnerContract {
  run(plan: HorizonPlan): Promise<HorizonOrchestratorResult>;
  query(input: HorizonQuery): Promise<HorizonReadResult>;
  snapshot(input: HorizonLookupConfig): Promise<HorizonServiceSnapshot>;
  drain(planId: PlanId): Promise<ValidationResult<true>>;
  replayEvents(input: HorizonLookupConfig): Promise<readonly HorizonMutationEvent[]>;
}

export type StageResult = {
  readonly stage: PluginStage;
  readonly startedAt: TimeMs;
  readonly elapsedMs: TimeMs;
  readonly ok: boolean;
  readonly errors: readonly string[];
};

export interface StageReport {
  readonly runId: RunId;
  readonly planName: string;
  readonly elapsedMs: TimeMs;
  readonly stages: readonly StageResult[];
}

export type WithStage<T extends HorizonSignal<PluginStage, JsonLike>> = T & { readonly executedStage: PluginStage };

export interface RegistryEntry {
  readonly key: string;
  readonly enabled: boolean;
  readonly factory: RegistryEntryFactory;
}

export type RegistryEntryFactory = {
  readonly run: (
    signal: WithStage<HorizonSignal<PluginStage, JsonLike>>,
    abortSignal: AbortSignal,
  ) => Promise<void>;
};

export interface OrchestratorPlugin<TState> {
  readonly name: string;
  readonly create: (context: HorizonRunContext, config: HorizonOrchestratorConfig) => TState;
}

export type PluginMap<T extends readonly OrchestratorPlugin<any>[]> = {
  [K in T[number] as K['name']]: K;
};

export type PluginRuntime<TKind extends PluginStage, TPayload> = (
  input: ReadonlyArray<PluginConfig<TKind, TPayload>>,
  signal: AbortSignal,
) => Promise<readonly HorizonSignal<TKind, TPayload>[]>;

export type StageSequence<T extends readonly PluginStage[]> = ReadonlyArray<{
  readonly stage: PluginStage;
  readonly order: number;
  readonly execute: PluginRuntime<PluginStage, JsonLike>;
}>;

export type PluginTuple<T extends readonly PluginRuntime<PluginStage, JsonLike>[]> = {
  readonly [P in keyof T]: {
    readonly index: P;
    readonly run: T[P];
  };
};

export type PipelineResult<T extends PluginStage[]> = {
  readonly plan: HorizonPlan;
  readonly stages: StageResult[];
  readonly records: Readonly<{ [K in T[number]]: HorizonStoreRecord[] }>;
};

export type ErrorHandler = (error: unknown) => string;
export type StageGuard<T extends PluginStage> = (stage: T, record: HorizonSignal<T, JsonLike>) => boolean;
