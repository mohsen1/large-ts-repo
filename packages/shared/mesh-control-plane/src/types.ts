import type { NoInfer } from '@shared/stress-lab-runtime';
import type {
  MeshLane,
  MeshMode,
  MeshManifest,
  MeshRuntimeEvent,
  MeshRuntimeState,
  MeshPluginFingerprint,
  MeshRunEnvelope,
} from '@shared/orchestration-lab-core';

export type ControlPlaneRunId = `${string}::${string}::${string}::${string}`;
export type ControlPlaneTenantId = `${string}`;
export type ControlPlaneSessionId = `${string}::${string}::${string}`;
export type ControlPlaneStreamId = `${string}::${string}`;
export type ControlPlaneConstraintName = string;

export type ControlPlaneLane = MeshLane | 'governance' | 'postmortem';
export type ControlPlaneMode = MeshMode | 'audit' | 'rollback';
export type ControlPlaneNamespace = `${ControlPlaneLane}:${ControlPlaneMode}`;

export type ControlPlaneRoute<T extends string = string> = `control-plane/${T}`;
export type ControlPlaneSignalSource<T extends string = string> = `source:${T}`;
export type ControlPlanePolicyTag<T extends string = string> = `policy:${T}`;
export type ControlPlaneTemplateKey<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? `${Head}:${ControlPlaneTemplateKey<Tail>}`
  : T;
export type SignalPayload = Record<string, unknown>;

export interface ControlPlaneConstraint<TName extends string = string> {
  readonly name: TName;
  readonly required: boolean;
  readonly weight: number;
}

export interface ControlPlaneCandidate<TInput extends SignalPayload = SignalPayload> {
  readonly source: ControlPlaneSignalSource;
  readonly route: ControlPlaneRoute;
  readonly constraints: readonly ControlPlaneConstraint[];
  readonly payload: TInput;
}

export interface ControlPlaneManifest<TContext extends SignalPayload = SignalPayload> {
  readonly runId: ControlPlaneRunId;
  readonly tenantId: ControlPlaneTenantId;
  readonly lane: ControlPlaneLane;
  readonly mode: ControlPlaneMode;
  readonly sessionId: ControlPlaneSessionId;
  readonly namespace: ControlPlaneNamespace;
  readonly constraints: readonly ControlPlaneConstraint[];
  readonly context: TContext;
  readonly streamId: ControlPlaneStreamId;
}

export interface ControlPlaneRunMetadata<TContext extends SignalPayload = SignalPayload> {
  readonly manifest: MeshManifest;
  readonly stage: number;
  readonly manifestSource: MeshRunEnvelope['route'];
  readonly context: TContext;
  readonly runtimeFingerprint: MeshPluginFingerprint;
}

export interface ControlPlaneSnapshot<TPayload = SignalPayload> {
  readonly runId: ControlPlaneRunId;
  readonly tenantId: ControlPlaneTenantId;
  readonly lane: MeshLane;
  readonly mode: ControlPlaneMode;
  readonly score: number;
  readonly confidence: number;
  readonly events: readonly MeshRuntimeEvent[];
  readonly payload: TPayload;
}

export interface ControlPlaneCommand<TPayload extends SignalPayload = SignalPayload> {
  readonly command: `cp:${'start' | 'pause' | 'abort' | 'close'}`;
  readonly payload: TPayload;
}

export interface ControlPlaneResponse<TPayload = unknown> {
  readonly ok: boolean;
  readonly reason?: string;
  readonly payload?: TPayload;
  readonly events: readonly MeshRuntimeEvent[];
}

export interface MeshControlPlaneTask {
  readonly id: `${string}-${string}-${number}`;
  readonly command: ControlPlaneCommand;
  readonly order: number;
  readonly weight: number;
}

export interface MeshControlPlaneRun {
  readonly runId: ControlPlaneRunId;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly startedAt: string;
  readonly state: MeshRuntimeState;
  readonly fingerprint: MeshPluginFingerprint;
}

export interface MeshControlPlaneLanePlan {
  readonly lane: MeshLane;
  readonly weight: number;
}

export interface ControlPlaneManifestHint {
  readonly tenantId: ControlPlaneTenantId;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly namespace: string;
}

export interface MeshControlPlaneExecutionPlan {
  readonly tenantId: ControlPlaneTenantId;
  readonly manifestHint: ControlPlaneManifestHint;
  readonly commands: readonly ControlPlaneCommand[];
  readonly lanes: readonly MeshControlPlaneLanePlan[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MeshControlPlaneLaneWeights {
  readonly lane: MeshLane;
  readonly weight: number;
}

export type MeshControlPlaneTimelineEntry = {
  readonly tick: number;
  readonly lane: MeshLane;
  readonly score: number;
};

export type MeshControlPlaneExecutionOutput = {
  readonly payload: Record<string, unknown>;
  readonly summary?: string;
  readonly policies?: readonly string[];
  readonly timeline?: readonly MeshControlPlaneTimelineEntry[];
  readonly score?: number;
  readonly fingerprint?: string;
};

export interface MeshControlPlaneResult {
  readonly ok: boolean;
  readonly snapshot: ControlPlaneSnapshot<MeshControlPlaneExecutionOutput>;
  readonly metadata: ControlPlaneRunMetadata;
  readonly command: ControlPlaneCommand;
  readonly telemetry: readonly MeshRuntimeEvent[];
}

export interface MeshControlPlaneRunInput {
  readonly plan: MeshControlPlaneExecutionPlan;
  readonly configId: string;
  readonly stream: readonly string[];
}

export type ConstraintRecord<TValues extends readonly ControlPlaneConstraint[]> = {
  [K in TValues[number] as K['name']]: K['weight'];
};

export const ConstraintList = <T extends readonly ControlPlaneConstraint[]>(values: T): ConstraintRecord<T> => Object.fromEntries(
  values.map((entry) => [entry.name, entry.weight]),
) as ConstraintRecord<T>;

export const defaultControlLane = 'signal' satisfies ControlPlaneLane;

export type MeshControlPlaneTimelineInput = {
  readonly runId: ControlPlaneRunId;
  readonly score: number;
  readonly confidence: number;
  readonly fingerprint: string;
  readonly policies: readonly string[];
  readonly timeline: readonly MeshControlPlaneTimelineEntry[];
};

export const buildConstraintKey = <TConstraint extends ControlPlaneConstraint>(
  constraint: TConstraint,
): `lane-${TConstraint['name']}` => `lane-${constraint.name}`;

export const createMeshControlPlan = <TPlan extends Omit<MeshControlPlaneExecutionPlan, 'tenantId'> & { readonly tenantId: ControlPlaneTenantId }>(
  plan: TPlan,
): MeshControlPlaneExecutionPlan => ({
  ...plan,
  metadata: {
    ...plan.metadata,
    source: 'shared/mesh-control-plane',
    builtAt: new Date().toISOString(),
  },
});

export const defaultPolicyTimeline = (values: readonly string[]): readonly MeshControlPlaneTimelineEntry[] =>
  values.toSorted().map((value, index) => ({
    tick: index,
    lane: index % 2 === 0 ? 'policy' : 'safety',
    score: Number((index + 1) / Math.max(1, values.length)),
  }));

export const laneFromManifest = (manifest: Pick<ControlPlaneManifest, 'lane' | 'mode'>): ControlPlaneNamespace =>
  `${manifest.lane}:${manifest.mode}`;

export const toControlRunId = (tenantId: string, lane: MeshLane, mode: ControlPlaneMode): ControlPlaneRunId =>
  `${tenantId}::${lane}::${mode}::${Date.now()}`;

export const mergeNoInfer = <T>(left: NoInfer<T>, right: NoInfer<T>): readonly [T, T] => [left, right];
