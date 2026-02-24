import type { Brand } from '@shared/core';
import { Brand as SharedBrand, type NoInfer } from '@shared/type-level';
import type {
  ConductorPluginContext,
  ConductorPluginDefinition,
  ConductorPluginId,
  ConductorPluginPhase,
} from '@shared/recovery-orchestration-runtime';

export type StudioNamespace = Brand<string, 'IncidentStudioNamespace'>;
export type StudioRunId = Brand<string, 'IncidentStudioRunId'>;
export type StudioTenantId = Brand<string, 'IncidentTenantId'>;
export type StudioIncidentId = Brand<string, 'IncidentId'>;
export type StudioOperatorId = Brand<string, 'OperatorId'>;
export type StudioStepId = Brand<string, 'StudioStepId'>;
export type StudioPolicyId = Brand<string, 'StudioPolicyId'>;
export type StudioPlaybookId = Brand<string, 'StudioPlaybookId'>;

export type StudioTag = SharedBrand<string, 'StudioTag'>;

export type StudioSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type StudioSignalKind = `${StudioSeverity}:${string}`;
export type StudioNamespaceEvent<T extends string> = `${StudioNamespace & string}.${T}`;

export type RecursiveTuple<T extends unknown[]> = T extends [infer H, ...infer R]
  ? [H, ...RecursiveTuple<R>]
  : [];

export type AppendTuple<T extends readonly unknown[], V> = [...T, V];
export type PrependTuple<V, T extends readonly unknown[]> = [V, ...T];
export type ZipTuple<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [
  infer AH,
  ...infer AR,
]
  ? B extends readonly [infer BH, ...infer BR]
    ? [[AH, BH], ...ZipTuple<AR, BR>]
    : []
  : [];

export type PluginTuple<T, N extends number, A extends T[] = []> = A['length'] extends N
  ? A
  : PluginTuple<T, N, [...A, T]>;

export interface RuntimeWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly timezone: string;
}

export interface IncidentActor {
  readonly id: StudioOperatorId;
  readonly name: string;
  readonly email: string;
}

export interface IncidentScenario {
  readonly id: StudioIncidentId;
  readonly tenantId: StudioTenantId;
  readonly owner: string;
  readonly title: string;
  readonly tags: readonly StudioTag[];
  readonly window: RuntimeWindow;
}

export interface IncidentMetricSample {
  readonly source: string;
  readonly name: string;
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'percent';
}

export interface IncidentCandidate {
  readonly id: StudioPlaybookId;
  readonly name: string;
  readonly tenantId: StudioTenantId;
  readonly score: number;
  readonly risks: readonly {
    readonly id: string;
    readonly severity: StudioSeverity;
    readonly description: string;
  }[];
  readonly steps: readonly string[];
}

export interface WorkflowSnapshot {
  readonly runId: StudioRunId;
  readonly incidentId: StudioIncidentId;
  readonly tenantId: StudioTenantId;
  readonly sampledAt: string;
  readonly candidates: readonly IncidentCandidate[];
  readonly metrics: readonly IncidentMetricSample[];
  readonly activeSignals: number;
}

export interface IncidentWorkflowInput {
  readonly tenantId: StudioTenantId;
  readonly incidentId: StudioIncidentId;
  readonly operatorId: StudioOperatorId;
  readonly window: RuntimeWindow;
  readonly urgencyMinutes: number;
  readonly tolerance: {
    readonly minimumCoverage: number;
    readonly maxSteps: number;
  };
}

export interface DiscoveryOutput {
  readonly runId: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly incident: IncidentScenario;
  readonly candidates: readonly IncidentCandidate[];
}

export interface AssessmentOutput {
  readonly runId: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly incidentId: StudioIncidentId;
  readonly candidates: readonly IncidentCandidate[];
  readonly scoreByPlaybook: Readonly<Record<StudioPlaybookId, number>>;
  readonly bestCandidate?: StudioPlaybookId;
}

export interface SimulationOutput {
  readonly runId: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly incidentId: StudioIncidentId;
  readonly bestCandidate?: StudioPlaybookId;
  readonly policy: {
    readonly policyId: StudioPolicyId;
    readonly confidence: number;
    readonly estimatedMinutes: number;
  };
  readonly snapshot: WorkflowSnapshot;
}

export interface OrchestrationOutput {
  readonly runId: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly policy: {
    readonly id: StudioPolicyId;
    readonly candidateId?: StudioPlaybookId;
    readonly controls: readonly string[];
    readonly approved: boolean;
  };
  readonly telemetry: {
    readonly generatedAt: string;
    readonly notes: readonly string[];
    readonly severity: StudioSeverity;
  };
}

export type PluginInput<TPlugin extends ConductorPluginDefinition> = TPlugin extends ConductorPluginDefinition<
  infer TInput,
  any,
  any,
  any
>
  ? TInput
  : never;

export type PluginOutput<TPlugin extends ConductorPluginDefinition> = TPlugin extends ConductorPluginDefinition<
  any,
  infer TOutput,
  any,
  any
>
  ? TOutput
  : never;

export type CompatibleChain<
  TChain extends readonly ConductorPluginDefinition[],
> = TChain extends readonly [
  infer Head extends ConductorPluginDefinition<any, any, any, any>,
  ...infer Tail extends readonly ConductorPluginDefinition[],
]
  ? Tail extends readonly []
    ? [Head]
    : Head extends ConductorPluginDefinition<any, infer HeadOut, any, any>
      ? Tail extends readonly [infer Next extends ConductorPluginDefinition<HeadOut, any, any, any>, ...infer Rest extends readonly ConductorPluginDefinition[]]
        ? [Head, ...CompatibleChain<Rest & readonly ConductorPluginDefinition[]>]
        : never
      : never
  : [];

export type CompatibleChainOutput<
  TChain extends readonly ConductorPluginDefinition[],
> = TChain extends readonly [
  infer Head extends ConductorPluginDefinition<any, infer HeadOut, any, any>,
  ...infer Tail extends readonly ConductorPluginDefinition[],
]
  ? Tail extends readonly []
    ? HeadOut
    : Tail extends readonly [ConductorPluginDefinition<HeadOut, infer NextOut, any, any>, ...readonly ConductorPluginDefinition[]]
      ? CompatibleChainOutput<Tail>
      : never
  : unknown;

export type RemapMetricFields<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `metric:${K}` : never]: T[K];
};

export type WithPluginIdPrefix<T extends { id: string }> = {
  [K in keyof T as `${K & string}`]: T[K];
};

export type WorkspacePolicyEnvelope<TPolicy extends { id: string }> = {
  readonly id: TPolicy['id'];
  readonly policy: TPolicy;
};

export type WorkspaceError<TCode extends string = string> = {
  readonly id: StudioRunId;
  readonly code: TCode;
  readonly message: string;
};

export interface ExecutionContext<TConfig extends Record<string, unknown>> {
  readonly namespace: StudioNamespace;
  readonly runId: StudioRunId;
  readonly phase: ConductorPluginPhase;
  readonly tenantId: StudioTenantId;
  readonly startedAt: string;
  readonly config: Readonly<TConfig>;
}

export interface OrchestrationDiagnostics {
  readonly pluginId: ConductorPluginId;
  readonly pluginName: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly diagnostics: readonly string[];
}

export interface OrchestrationWorkspaceSnapshot {
  readonly runId: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly chainLength: number;
  readonly pluginMap: Record<ConductorPluginId, ConductorPluginContext>;
  readonly diagnostics: readonly OrchestrationDiagnostics[];
}

export interface OrchestrationCommand {
  readonly runId: StudioRunId;
  readonly payload: IncidentWorkflowInput;
  readonly options: {
    readonly dryRun: boolean;
    readonly maxConcurrency: NoInfer<number>;
    readonly includeSignalTrace: boolean;
  };
}
