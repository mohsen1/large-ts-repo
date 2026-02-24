import type {
  IntentExecutionContext,
  IntentExecutionResult,
  IntentNodePayload,
  IntentOutput,
  IntentPolicy,
  IntentRunId,
  IntentStage,
  IntentTelemetry,
  IntentInput,
  PluginContract,
} from '@domain/recovery-intent-graph';

export interface OrchestratorConfig {
  readonly maxConcurrency: number;
  readonly retryLimit: number;
  readonly pluginTimeoutMs: number;
  readonly sampleRate: number;
  readonly failFast: boolean;
}

export interface OrchestratorRequest {
  readonly requestId: string;
  readonly tenant: string;
  readonly envelope: string;
}

export interface OrchestratorEvent {
  readonly runId: IntentRunId;
  readonly graphId: string;
  readonly name: 'started' | 'node-entered' | 'node-completed' | 'node-failed' | 'completed';
  readonly payload: Readonly<Record<string, unknown>>;
  readonly at: Date;
}

export interface EngineOutput {
  readonly outcome: IntentExecutionResult;
  readonly telemetry: readonly IntentTelemetry[];
  readonly events: readonly OrchestratorEvent[];
  readonly outputs: readonly IntentOutput[];
  readonly recommendations: readonly string[];
}

export interface OrchestrationState {
  readonly request: OrchestratorRequest;
  readonly events: readonly OrchestratorEvent[];
  readonly startedAt: Date;
  readonly finishedAt?: Date;
}

export interface OrchestratorResult extends EngineOutput {
  readonly state: OrchestrationState;
}

export type PlanCatalog = readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[];

export interface EngineRequest {
  readonly policy: IntentPolicy<PlanCatalog>;
  readonly request: OrchestratorRequest;
  readonly input: IntentInput & { readonly nodes: readonly IntentNodePayload[] };
}

export interface AdapterRegistry {
  register<TKind extends IntentStage>(
    plugin: PluginContract<TKind, IntentNodePayload, IntentNodePayload>,
  ): void;
  resolve<TKind extends IntentStage>(stage: TKind): readonly PluginContract<TKind, IntentNodePayload, IntentNodePayload>[];
}

export type EngineRuntimeContext = Omit<IntentExecutionContext<IntentNodePayload>, 'node' | 'payload' | 'abort'> & {
  readonly node: IntentExecutionContext<IntentNodePayload>['node'];
  readonly payload: IntentNodePayload;
  readonly abort: AbortSignal;
};
