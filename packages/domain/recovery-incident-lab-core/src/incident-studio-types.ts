import { Brand, withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type { IncidentLabScenario, IncidentLabSignal } from './types';
import type {
  CommandRunbook,
  CommandRunbookId,
  RecoverySignal,
  SignalClass,
} from '@domain/recovery-stress-lab';

export const studioStages = ['discovery', 'compose', 'schedule', 'execute', 'telemetry', 'report'] as const;
export type StudioStage = (typeof studioStages)[number];

export const sessionStates = ['inactive', 'starting', 'running', 'completed', 'degraded', 'terminated'] as const;
export type StudioSessionState = (typeof sessionStates)[number];

export const studioLaneKinds = ['control', 'compute', 'storage', 'network', 'safety', 'policy'] as const;
export type StudioLaneKind = (typeof studioLaneKinds)[number];

export type StudioSessionId = Brand<string, 'IncidentLabStudioSessionId'>;
export type StudioWorkspaceId = Brand<string, 'IncidentLabStudioWorkspaceId'>;
export type StudioRunId = Brand<string, 'IncidentLabStudioRunId'>;
export type StudioRouteId = Brand<string, 'IncidentLabStudioRouteId'>;
export type StudioSignalEnvelopeId = Brand<string, 'IncidentLabStudioSignalEnvelopeId'>;

export type StudioRoute<S extends string = string> = Brand<S, 'StudioRoute'>;
export type StudioLaneId<S extends string = string> = Brand<S, 'StudioLaneId'>;
export type WorkspaceScope<S extends string = string> = Brand<S, 'WorkspaceScope'>;

export type StudioRecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...StudioRecursiveTuple<Tail>]
  : readonly [];

export type SignalClassBucket<T extends SignalClass = SignalClass> = `${T}:low`;
export type SignalBucketKey<T extends SignalClass = SignalClass> = `${T}:window`;
export type SignalClassTuple<T extends readonly SignalClass[]> = T extends readonly [
  infer Head extends SignalClass,
  ...infer Rest extends readonly SignalClass[],
]
  ? readonly [SignalClassBucket<Head>, ...SignalClassTuple<Rest>]
  : readonly [];

export type StudioRecursiveLaneTuple<T extends readonly StudioLaneKind[]> = T extends readonly [
  infer Head extends StudioLaneKind,
  ...infer Rest extends readonly StudioLaneKind[],
]
  ? readonly [Head, ...StudioRecursiveLaneTuple<Rest>]
  : readonly [];

export const studioWorkspaceStages = ['idle', 'seeded', 'scheduled', 'executed', 'complete', 'degraded'] as const;

export type WorkspaceLaneProfile<T extends readonly StudioLaneKind[] = readonly StudioLaneKind[]> = StudioRecursiveLaneTuple<T>;

export interface IncidentLabStudioInput {
  readonly sessionId: StudioSessionId;
  readonly tenantId: string;
  readonly workspaceId: StudioWorkspaceId;
  readonly runId: StudioRunId;
  readonly stage: StudioStage;
  readonly scenario: import('./types').IncidentLabScenario;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: readonly CommandRunbookId[];
  readonly signals: readonly RecoverySignal[];
}

export interface IncidentLabStudioConfig<TSignals extends readonly SignalClass[] = readonly SignalClass[]> {
  readonly scope: WorkspaceScope;
  readonly lanes: WorkspaceLaneProfile;
  readonly signalBuckets: SignalClassTuple<TSignals>;
  readonly includeTelemetry: boolean;
  readonly riskTolerance: number;
}

export interface IncidentLabStudioBlueprint<TSignals extends readonly SignalClass[] = readonly SignalClass[]> {
  readonly blueprintId: Brand<string, 'IncidentLabBlueprintId'>;
  readonly sessionId: StudioSessionId;
  readonly workspaceId: StudioWorkspaceId;
  readonly runId: StudioRunId;
  readonly config: IncidentLabStudioConfig<TSignals>;
  readonly scenarioId: Brand<string, 'ScenarioId'>;
  readonly signalBuckets: SignalClassTuple<TSignals>;
  readonly commandCount: number;
  readonly route: StudioRoute;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IncidentLabStudioState {
  readonly route: StudioRoute;
  readonly sessionId: StudioSessionId;
  readonly state: StudioSessionState;
  readonly lastStage: StudioStage;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly signalKeys: readonly string[];
}

export interface IncidentLabStudioManifest {
  readonly signature: Brand<string, 'IncidentLabStudioManifestSignature'>;
  readonly blueprint: IncidentLabStudioBlueprint;
  readonly state: Omit<IncidentLabStudioState, 'route'>;
  readonly scenario: IncidentLabScenario;
}

export interface IncidentLabStudioRunState<TInput = unknown> {
  readonly sessionId: StudioSessionId;
  readonly runId: StudioRunId;
  readonly route: StudioRoute;
  readonly input: TInput;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly stage: StudioStage;
  readonly outcome: 'pending' | 'success' | 'degraded' | 'failed';
}

export interface IncidentLabStudioTelemetry {
  readonly sessionId: StudioSessionId;
  readonly frameCount: number;
  readonly warnings: readonly string[];
  readonly markers: readonly string[];
}

export type SignalLaneSignature<TSignals extends readonly SignalClass[] = readonly SignalClass[]> = {
  [Kind in TSignals[number]]: `${Kind}:low`;
};

export interface WorkloadMap {
  readonly byRunbook: Record<CommandRunbookId, Brand<string, 'WorkloadId'>>;
  readonly bySignal: Record<Brand<string, 'RecoverySignalId'>, Brand<string, 'WorkloadId'>>;
  readonly byScenario: Record<Brand<string, 'ScenarioId'>, readonly CommandRunbook['id'][]>;
}

const stageSignature = (seed: string): string => `${seed}:${Date.now()}`;

export const studioStudioScope = (scope: string): WorkspaceScope<string> => withBrand(scope, 'WorkspaceScope');

export const createWorkspaceId = (tenant: string): StudioWorkspaceId =>
  withBrand(`${tenant}:workspace:${stageSignature('ws')}`, 'IncidentLabStudioWorkspaceId');

export const createStudioSessionId = (input: string): StudioSessionId =>
  withBrand(`studio-session:${input}:${stageSignature('session')}`, 'IncidentLabStudioSessionId');

export const createStudioRunId = (input: string): StudioRunId =>
  withBrand(`studio-run:${input}:${stageSignature('run')}`, 'IncidentLabStudioRunId');

export const createStudioRoute = (scope: string, route: string): StudioRoute =>
  withBrand(`${scope}:route:${route}`, 'StudioRoute');

export const createStudioSignalEnvelopeId = (seed: string): StudioSignalEnvelopeId =>
  withBrand(`${seed}:signal-envelope:${stageSignature('envelope')}`, 'IncidentLabStudioSignalEnvelopeId');

export const studioRoute = (name: string): StudioRoute => createStudioRoute('incident-lab', name);

export const createStudioBlueprint = <const TSignals extends readonly SignalClass[]>(
  input: {
    readonly sessionId: StudioSessionId;
    readonly workspaceId: StudioWorkspaceId;
    readonly runId: StudioRunId;
    readonly scenarioId: Brand<string, 'ScenarioId'>;
    readonly signalBuckets: NoInfer<TSignals>;
    readonly laneKinds: readonly StudioLaneKind[];
  },
): IncidentLabStudioBlueprint<TSignals> => {
  const fallback: readonly SignalClass[] = ['availability'];
  const normalizedBuckets = (input.signalBuckets.length > 0 ? input.signalBuckets : fallback) as readonly SignalClass[];
  const signalBuckets = normalizedBuckets.slice(0, 6).map((kind) => `${kind}:low`) as unknown as SignalClassTuple<TSignals>;
  const commandCount = Math.max(1, input.laneKinds.length * 4);

  return {
    blueprintId: withBrand(`${input.runId}:blueprint:${input.workspaceId}`, 'IncidentLabBlueprintId'),
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    runId: input.runId,
    config: {
      scope: studioStudioScope('incident-lab'),
      lanes: input.laneKinds as WorkspaceLaneProfile,
      signalBuckets,
      includeTelemetry: true,
      riskTolerance: 0.67,
    },
    scenarioId: input.scenarioId,
    signalBuckets,
    commandCount,
    route: createStudioRoute('incident-lab', 'bootstrap'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies IncidentLabStudioBlueprint<TSignals>;
};

export const buildStudioEnvelope = <T>(input: {
  readonly sessionId: StudioSessionId;
  readonly scenario: IncidentLabScenario;
  readonly runId: StudioRunId;
  readonly payload: T;
  readonly origin: string;
}): import('./types').IncidentLabEnvelope<T> => ({
  id: withBrand(`${input.runId}:envelope:${input.sessionId}`, 'EnvelopeId'),
  labId: withBrand(`${input.sessionId}:lab`, 'IncidentLabId'),
  scenarioId: input.scenario.id,
  payload: input.payload,
  createdAt: new Date().toISOString(),
  origin: input.origin,
});

export const toStudioLaneId = (value: StudioLaneKind, index: number): StudioLaneId<`lane:${StudioLaneKind}`> =>
  withBrand(`lane:${value}:${index}`, 'StudioLaneId') as unknown as StudioLaneId<`lane:${StudioLaneKind}`>;

export const buildWorkspaceManifest = (
  input: IncidentLabStudioBlueprint,
  state: Omit<IncidentLabStudioState, 'route'>,
): IncidentLabStudioManifest => ({
  signature: withBrand(stageSignature(`${input.sessionId}:manifest:${state.lastStage}`), 'IncidentLabStudioManifestSignature'),
  blueprint: input,
  state,
  scenario: {
    id: withBrand(`${input.sessionId}:scenario`, 'ScenarioId'),
    labId: withBrand(`lab:${input.workspaceId}`, 'IncidentLabId'),
    name: 'incident-studio-scenario',
    createdBy: 'incident-lab-core',
    severity: 'medium',
    topologyTags: ['studio', state.lastStage, ...input.config.lanes],
    steps: [],
    estimatedRecoveryMinutes: state.signalKeys.length,
    owner: 'incident-lab-core',
    labels: ['studio', state.lastStage],
  },
});

export const buildRunState = <TInput>(input: {
  readonly sessionId: StudioSessionId;
  readonly runId: StudioRunId;
  readonly route: StudioRoute;
  readonly input: TInput;
  readonly outcome: IncidentLabStudioRunState['outcome'];
  readonly stage: StudioStage;
}): IncidentLabStudioRunState<TInput> => ({
  sessionId: input.sessionId,
  runId: input.runId,
  route: input.route,
  input: input.input,
  startedAt: new Date().toISOString(),
  stage: input.stage,
  outcome: input.outcome,
});
