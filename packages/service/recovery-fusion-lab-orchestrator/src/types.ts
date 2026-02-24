import type { Brand, NoInfer, Prettify } from '@shared/type-level';
import type {
  LabCommand,
  LabMetricPoint,
  LabPlan,
  LabPolicyEnvelope,
  LabRunMetrics,
  LabSignal,
  LabWave,
  LabWavePhase,
  MeshForecast,
  MeshTopology,
  asLabRunId,
} from '@domain/recovery-fusion-lab-core';
import type { Result } from '@shared/result';

export type LabStatus = 'idle' | 'warming' | 'running' | 'completed' | 'failed';
export type LabRunMode = 'realtime' | 'historical' | 'dry-run';
export type LabFailureKind = 'plugin' | 'validation' | 'saturation' | 'runtime';
export type LabRunCode = Brand<string, 'LabRunCode'>;

export type PluginName = `fusion-lab-plugin:${string}`;
export type TimelineEvent = `fusion-lab.${LabWavePhase}`;
export type ReadonlyBrand<T extends string> = Brand<T, 'Readonly'>;

export interface WorkspaceRequestContext {
  readonly tenant: string;
  readonly workspace: string;
  readonly requestedBy: string;
}

export interface FusionLabRunSpec {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly mode: LabRunMode;
  readonly maxParallelism: number;
  readonly traceLevel: 'quiet' | 'normal' | 'verbose';
}

export interface FusionLabExecutionRequest {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly mode: LabRunMode;
  readonly maxParallelism: number;
  readonly traceLevel: 'quiet' | 'normal' | 'verbose';
  readonly topology: MeshTopology;
  readonly forecast?: MeshForecast;
  readonly policies: readonly LabPolicyEnvelope[];
  readonly context: WorkspaceRequestContext;
  readonly pluginNames?: readonly PluginName[];
}

export interface FusionLabExecutionResult {
  readonly runId: ReturnType<typeof asLabRunId>;
  readonly status: LabStatus;
  readonly waves: readonly LabWave[];
  readonly signals: readonly LabSignal[];
  readonly commands: readonly LabCommand[];
  readonly metrics: readonly LabMetricPoint[];
  readonly summary: LabRunMetrics;
  readonly commandTrace: readonly string[];
  readonly traceDigest: string;
}

export interface FusionLabWorkspace {
  readonly runId: ReturnType<typeof asLabRunId>;
  readonly status: LabStatus;
  readonly plan?: LabPlan<unknown, unknown>;
  readonly result?: FusionLabExecutionResult;
  readonly spec: FusionLabRunSpec;
}

export interface LabTimelineFrame {
  readonly at: string;
  readonly event: TimelineEvent;
  readonly phase: LabWavePhase;
}

export type WorkspaceResult<T extends FusionLabExecutionRequest = FusionLabExecutionRequest> = Result<
  {
    readonly workspace: FusionLabWorkspace;
    readonly plan: LabPlan<unknown, unknown>;
    readonly frames: readonly LabTimelineFrame[];
  },
  Error
>;

export interface WorkspaceExecutionOptions {
  readonly includeTelemetry: boolean;
  readonly useTopLevelBootstrap: boolean;
  readonly pluginNames?: readonly PluginName[];
}

export interface TopologyDigest {
  readonly workspace: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly hash: string;
}

export type PrettifyWorkspace<T> = Prettify<T>;
export type InputConstraint<T> = NoInfer<T>;
export interface LabRunFailure {
  readonly kind: LabFailureKind;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type LabRunWithForecast = {
  readonly forecast: MeshForecast;
  readonly plan: LabPlan<unknown, unknown>;
};
