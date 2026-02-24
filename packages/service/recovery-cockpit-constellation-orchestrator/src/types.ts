import type { NoInfer } from '@shared/type-level';
import type {
  ConstellationMode,
  ConstellationStage,
  ConstellationTopology,
  ConstellationId,
  ConstellationRunId,
  StageScoreTuple,
} from '@domain/recovery-cockpit-constellation-core';
import type {
  ConstellationEvent,
  ConstellationEventCategory,
  ConstellationPlugin,
  PluginExecutionResult,
  StagePayload,
  StageOutput,
  ConstellationContext,
} from '@domain/recovery-cockpit-constellation-core';
import type { SimulationEnvelope } from '@domain/recovery-cockpit-constellation-core';
import type { ConstellationRunSnapshot } from '@data/recovery-cockpit-constellation-store';
import type { RecoveryPlan } from '@domain/recovery-cockpit-models';

export type OrchestratorMode = 'preview' | 'live';
export type OrchestratorPhase = 'bootstrap' | 'simulation' | 'execution' | 'review' | 'finalize';
export type OrchestratorStatus = 'queued' | 'running' | 'complete' | 'failed' | 'partial';
export type OrchestratorErrorCode =
  | 'input-empty'
  | 'plugin-failed'
  | 'plugin-timeout'
  | 'store-error'
  | 'invalid-stage-order';

export interface OrchestratorInput {
  readonly constellationId: ConstellationId;
  readonly mode: OrchestratorMode;
  readonly runMode: ConstellationMode;
  readonly plan: RecoveryPlan;
  readonly preferredPath?: readonly ConstellationStage[];
  readonly pluginIds?: readonly string[];
}

export interface OrchestratorResponse {
  readonly requestId: string;
  readonly status: OrchestratorStatus;
  readonly startedAt: string;
  readonly phase: OrchestratorPhase;
}

export interface OrchestratorError {
  readonly code: OrchestratorErrorCode;
  readonly message: string;
  readonly stage?: ConstellationStage;
}

type GenericPluginInput<TPlugin extends ConstellationPlugin> = TPlugin extends ConstellationPlugin<
  infer TStage,
  infer TMode
>
  ? StagePayload<TStage, TMode>
  : never;

type GenericPluginOutput<TPlugin extends ConstellationPlugin> = TPlugin extends ConstellationPlugin<
  infer TStage,
  infer TMode
>
  ? StageOutput<TStage, TMode>
  : never;

type GenericPluginResult<TPlugin extends ConstellationPlugin> = PluginExecutionResult<
  TPlugin extends ConstellationPlugin<infer TStage, any> ? TStage : ConstellationStage,
  TPlugin extends ConstellationPlugin<any, infer TMode> ? TMode : ConstellationMode
>;

export interface StageRunResult<TPlugin extends ConstellationPlugin = ConstellationPlugin> {
  readonly plugin: TPlugin;
  readonly input: GenericPluginInput<TPlugin>;
  readonly output: GenericPluginOutput<TPlugin>;
  readonly events: readonly ConstellationEvent[];
  readonly payload: Readonly<Record<ConstellationEventCategory, number>>;
}

export interface OrchestratorContext {
  readonly runId: ConstellationRunId;
  readonly activeMode: ConstellationMode;
  readonly topology: ConstellationTopology;
  readonly selectedStages: readonly ConstellationStage[];
  readonly requestMode: OrchestratorMode;
}

export interface OrchestratorTelemetry {
  readonly points: readonly ConstellationEvent[];
  readonly scores: readonly StageScoreTuple[];
}

export interface StageEnvelope<TPlugin extends ConstellationPlugin = ConstellationPlugin> {
  readonly stage: TPlugin extends ConstellationPlugin<infer TStage, any> ? TStage : ConstellationStage;
  readonly startedAt: string;
  readonly pluginId: string;
  readonly score: number;
  readonly result: GenericPluginResult<TPlugin>;
}

export interface OrchestratorRuntime {
  readonly request: OrchestratorInput;
  readonly stages: readonly ConstellationStage[];
  readonly response: OrchestratorResponse;
  readonly snapshot?: ConstellationRunSnapshot;
  readonly envelopes: readonly StageEnvelope[];
  readonly simulations: readonly SimulationEnvelope[];
  readonly telemetry: OrchestratorTelemetry;
  readonly context: OrchestratorContext;
}

export interface StageContext {
  readonly runId: ConstellationRunId;
  readonly stage: ConstellationStage;
  readonly topology: ConstellationTopology;
  readonly context: ConstellationContext;
}

export interface TimelineProjection {
  readonly stage: ConstellationStage;
  readonly runId: ConstellationRunId;
}

export type PipelineDescriptor<TStages extends readonly ConstellationStage[]> = {
  readonly label: string;
  readonly stages: TStages;
  readonly runMode: ConstellationMode;
};

export type OrchestratorRun<TTopology extends ConstellationTopology = ConstellationTopology> = {
  readonly planId: string;
  readonly topology: TTopology;
  readonly stages: readonly ConstellationStage[];
  readonly pluginFilter?: readonly string[];
};

export type BuildPipelineInput<T extends readonly NoInfer<ConstellationStage>[]> = {
  readonly runMode: ConstellationMode;
  readonly stages: T;
  readonly plan: RecoveryPlan;
};
