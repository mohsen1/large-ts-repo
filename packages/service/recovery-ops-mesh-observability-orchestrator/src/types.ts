import type { Brand } from '@shared/core';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
} from '@domain/recovery-ops-mesh';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type ObservabilityId<T extends string> = Brand<string, `mesh-observability-${T}`>;

export interface ObservabilityPluginContext {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly plan: MeshTopology;
  readonly startedAt: number;
  readonly trace: readonly string[];
}

export interface ObservabilityPlugin<TInput, TOutput, TName extends string = string> {
  readonly id: ObservabilityId<TName>;
  readonly name: `obs-plugin/${TName}`;
  readonly version: `${number}.${number}.${number}`;
  readonly supports: readonly MeshSignalKind[];
  supportsSignal(input: unknown): input is TInput;
  execute(input: TInput, context: ObservabilityPluginContext): Promise<TOutput>;
  signature: string;
}

export interface ObservabilityPluginResult<TOutput> {
  readonly pluginId: string;
  readonly pluginName: string;
  readonly output: TOutput;
}

export interface ObservabilityRun {
  readonly id: MeshRunId;
  readonly planId: MeshPlanId;
  readonly startedAt: number;
  readonly reportId: ObservabilityId<'report'>;
}

export interface ObservabilityConfig {
  readonly namespace: string;
  readonly maxPlugins: number;
  readonly signalThreshold: number;
}

export const defaultWorkspaceConfig: ObservabilityConfig = {
  namespace: 'mesh.observability.workspace',
  maxPlugins: 16,
  signalThreshold: 70,
};

export interface ObservabilityReport {
  readonly run: ObservabilityRun;
  readonly profileSignature: string;
  readonly score: number;
  readonly traces: readonly string[];
  readonly pluginNames: readonly string[];
  readonly policySignals: readonly MeshSignalKind[];
}

export interface HealthProfile {
  readonly topologyId: MeshPlanId;
  readonly staleNodes: number;
  readonly hotLinks: number;
  readonly risk: number;
}

export const parseObservabilitySignals = (signals: readonly MeshSignalKind[]): readonly MeshSignalKind[] =>
  signals.toSorted();
