import type { Brand } from '@shared/type-level';
import type {
  PluginOutput,
  PluginDefinition,
  SynthesisPluginName,
  SynthesisTraceId,
  StageName,
} from '@shared/recovery-synthesis-runtime';

import type {
  ScenarioBlueprint,
  ScenarioCommand,
  ScenarioConstraint,
  ScenarioPlan,
  ScenarioReadModel,
  ScenarioSignal,
  ScenarioProfile,
} from './types';

export type SynthesisRuntimeId = Brand<string, 'SynthesisRuntimeId'>;

export interface SynthesisInput {
  readonly traceId: SynthesisTraceId;
  readonly blueprint: ScenarioBlueprint;
  readonly profile: ScenarioProfile;
  readonly constraints: readonly ScenarioConstraint[];
  readonly signals: readonly ScenarioSignal[];
  readonly policyIds: readonly string[];
}

export interface SynthesisPluginPayload {
  readonly source: 'raw' | 'normalised' | 'planned' | 'simulated' | 'governed';
  readonly commandOrder: readonly ScenarioCommand[];
  readonly warnings: readonly string[];
}

export interface SynthesisRiskEnvelope {
  readonly traceId: SynthesisTraceId;
  readonly riskScore: number;
  readonly commandRisk: Record<string, number>;
  readonly dependencyCount: number;
  readonly policyOverrides: readonly string[];
}

export interface SynthesisPlanEnvelope {
  readonly traceId: SynthesisTraceId;
  readonly plan: ScenarioPlan;
  readonly risk: SynthesisRiskEnvelope;
  readonly confidence: number;
}

export interface SynthesisSimulationSnapshot {
  readonly traceId: SynthesisTraceId;
  readonly generatedAt: string;
  readonly commandTimeline: readonly { readonly commandId: ScenarioCommand['commandId']; readonly stage: StageName }[];
  readonly plan: ScenarioPlan;
  readonly readModel: ScenarioReadModel;
}

export interface SynthesisWorkspaceEvent<TPayload = unknown> {
  readonly traceId: SynthesisTraceId;
  readonly kind: 'plan' | 'simulate' | 'govern' | 'store' | 'publish';
  readonly payload: TPayload;
  readonly when: string;
}

export interface SynthesisWorkspace {
  readonly runtimeId: SynthesisRuntimeId;
  readonly traceId: SynthesisTraceId;
  readonly events: readonly SynthesisWorkspaceEvent<unknown>[];
  readonly timeline: readonly SynthesisPluginPayload[];
  readonly latestOutput?: SynthesisSimulationSnapshot;
}

export type SynthesisStepName = `step:${string}`;
export type SynthesisTag<T extends string = string> = `tag:${T}`;

export interface SynthesisStepResult<
  TName extends SynthesisStepName,
  TOutput extends SynthesisPluginPayload = SynthesisPluginPayload,
> {
  readonly name: TName;
  readonly output: TOutput;
  readonly tags: SynthesisTag[];
}

export interface SynthesisRegistryArtifact {
  readonly plugin: SynthesisPluginName;
  readonly status: PluginOutput['status'];
  readonly outputId: string;
}

export type SynthesisPluginStep<
  TInput extends SynthesisPluginPayload,
  TOutput extends SynthesisPluginPayload,
  TName extends SynthesisPluginName = SynthesisPluginName,
  TStage extends StageName = StageName,
> = PluginDefinition<TInput, TOutput, TName, TStage, `namespace:${string}`>;
