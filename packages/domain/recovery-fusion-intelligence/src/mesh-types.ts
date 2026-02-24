import type { Brand } from '@shared/core';

export type MeshSemVer = `${number}.${number}.${number}`;

export type MeshPhase = 'ingest' | 'normalize' | 'plan' | 'execute' | 'observe' | 'finish';

export type MeshSignalClass = 'critical' | 'warning' | 'baseline';

export type MeshPriority = 0 | 1 | 2 | 3 | 4 | 5;

export type MeshNodeRole = 'source' | 'transform' | 'aggregator' | 'sink';

export type MeshNodeId = Brand<string, 'mesh-node'>;
export type MeshRunId = Brand<string, 'mesh-run'>;
export type MeshWaveId = Brand<string, 'mesh-wave'>;
export type MeshPolicyId = Brand<string, 'mesh-policy'>;
export type MeshPluginId = Brand<string, 'mesh-plugin'>;
export type MeshEventId = Brand<string, 'mesh-event'>;
export type MeshCommandId = Brand<string, 'mesh-command'>;
export type MeshWaveCommandId = Brand<string, 'mesh-wave-command'>;

export type MeshPluginName = `fusion-plugin:${string}`;

export type MeshPhaseMarker = `phase:${MeshPhase}`;

export interface MeshNode {
  readonly id: MeshNodeId;
  readonly role: MeshNodeRole;
  readonly score: number;
  readonly phase: MeshPhase;
  readonly active: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MeshEdge {
  readonly from: MeshNodeId;
  readonly to: MeshNodeId;
  readonly weight: number;
  readonly latencyMs: number;
  readonly mandatory: boolean;
}

export interface MeshTopology {
  readonly runId: MeshRunId;
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
  readonly updatedAt: string;
}

export interface MeshSignalEnvelope<TPayload = unknown> {
  readonly id: MeshEventId;
  readonly phase: MeshPhase;
  readonly source: MeshNodeId;
  readonly target?: MeshNodeId;
  readonly class: MeshSignalClass;
  readonly severity: MeshPriority;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface MeshCommand {
  readonly commandId: MeshCommandId;
  readonly runId: MeshRunId;
  readonly nodeId: MeshNodeId;
  readonly action: 'start' | 'pause' | 'resume' | 'finish';
  readonly actor: string;
  readonly rationale: string;
}

export interface MeshWave {
  readonly id: MeshWaveId;
  readonly runId: MeshRunId;
  readonly commandIds: readonly MeshWaveCommandId[];
  readonly nodes: readonly MeshNodeId[];
  readonly startAt: string;
  readonly windowMinutes: number;
}

export interface MeshRun {
  readonly id: MeshRunId;
  readonly topology: MeshTopology;
  readonly waves: readonly MeshWave[];
  readonly policies: readonly MeshPolicyId[];
  readonly phase: MeshPhase;
  readonly createdAt: string;
}

export interface MeshPolicy {
  readonly id: MeshPolicyId;
  readonly maxConcurrency: MeshPriority;
  readonly allowPause: boolean;
  readonly allowWarnings: boolean;
  readonly pluginIds: readonly MeshPluginId[];
  readonly phaseGating: Record<MeshPhase, boolean>;
}

export interface MeshManifestEntry {
  readonly pluginId: MeshPluginId;
  readonly name: MeshPluginName;
  readonly version: MeshSemVer;
  readonly versionLock: MeshSemVer;
  readonly description: string;
  readonly namespace: `mesh-${string}`;
  readonly priority: MeshPriority;
  readonly dependencies: readonly MeshPluginName[];
  readonly tags: readonly MeshSignalClass[];
}

export interface MeshManifestCatalog {
  readonly tenantId: string;
  readonly policyId: MeshPolicyId;
  readonly runId: MeshRunId;
  readonly timestamp: string;
  readonly plugins: readonly MeshManifestEntry[];
  readonly schemaVersion: '1.0' | '2.0';
}

export type MeshPluginInputShape<T> = {
  readonly [K in keyof T]: T[K];
};

export interface MeshPlugin<TInput = unknown, TOutput = unknown> {
  readonly manifest: MeshManifestEntry;
  readonly configure: (topology: MeshTopology) => MeshExecutionContext;
  readonly run: (input: MeshPluginInputShape<TInput>, context: MeshPluginContext) => Promise<MeshPluginInputShape<TOutput>>;
  readonly dispose?: () => Promise<void> | void;
}

export interface MeshPluginContext {
  readonly pluginId: MeshPluginId;
  readonly runId: MeshRunId;
  readonly nodeIndex: ReadonlyMap<MeshNodeId, MeshNode>;
  readonly signalSink: (signal: MeshSignalEnvelope) => void;
}

export interface MeshExecutionContext {
  readonly runId: MeshRunId;
  readonly topology: MeshTopology;
  readonly policy: MeshPolicy;
  readonly phase: MeshPhase;
  readonly startedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MeshRuntimeInput {
  readonly phases: readonly MeshPhase[];
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
  readonly pluginIds: readonly MeshPluginId[];
}

export interface MeshRuntimeEvent {
  readonly runId: MeshRunId;
  readonly phase: MeshPhase;
  readonly marker: MeshPhaseMarker;
  readonly payload: Record<string, unknown>;
}

export interface MeshRuntimeEventEnvelope<TType extends string, TPayload = unknown> {
  readonly kind: TType;
  readonly phase: MeshPhase;
  readonly payload: TPayload;
  readonly timestamp: string;
}

export interface MeshTelemetryPoint {
  readonly key: `mesh.${string}`;
  readonly value: number;
  readonly runId: MeshRunId;
  readonly timestamp: string;
}

export interface MeshPriorityEnvelope {
  readonly window: MeshPhase;
  readonly value: MeshPriority;
  readonly reasons: readonly string[];
}

export interface MeshRuntimeContext {
  readonly runId: MeshRunId;
  readonly topology: MeshTopology;
  readonly policy: MeshPolicy;
  readonly phase: MeshPhase;
  readonly startedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MeshOrchestrationSummary {
  readonly warningRatio: number;
  readonly warningCount: number;
  readonly commandCount: number;
  readonly waveCount: number;
}

export type MeshOrchestrationStatus = 'bootstrapping' | 'queued' | 'running' | 'degraded' | 'ok' | 'failed';

export interface MeshOrchestrationOutput {
  readonly runId: MeshRunId;
  readonly status: MeshOrchestrationStatus;
  readonly phases: readonly MeshPhase[];
  readonly waves: readonly MeshWave[];
  readonly commandIds: readonly MeshWaveCommandId[];
  readonly summary: MeshOrchestrationSummary;
}

export interface MeshPolicyWindow {
  readonly phase: MeshPhase;
  readonly enabled: boolean;
  readonly priorityCutoff: MeshPriority;
}

export type MeshPlanRecord = {
  readonly pluginId: MeshPluginId;
  readonly rank: MeshPriority;
  readonly reasons: readonly string[];
};

export type MeshRuntimeBlueprint = {
  readonly phases: readonly MeshPhase[];
  readonly maxWaveLength: number;
  readonly concurrency: MeshPriority;
};

export type MeshSignalMap<TRecord extends Record<string, number>> = {
  [K in keyof TRecord as `mesh.${Extract<K, string>}`]: TRecord[K];
};

export type MeshPluginNameMap<T extends readonly MeshManifestEntry[]> = {
  [K in T[number] as K['name']]: K;
};

export type MeshPluginByIdMap<T extends readonly MeshManifestEntry[]> = {
  [K in T[number] as K['pluginId']]: K;
};

export type PluginInputOf<T> = T extends MeshPlugin<infer I, unknown> ? I : never;
export type PluginOutputOf<T> = T extends MeshPlugin<unknown, infer O> ? O : never;

export type PluginName<T> = T extends { readonly name: infer Name } ? Name : never;

export type NodePath<T extends readonly MeshNode[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends MeshNode
      ? readonly [Head, ...NodePath<Tail & readonly MeshNode[]>]
      : readonly []
    : readonly [];

export type MeshPhaseString<T extends readonly MeshPhase[]> =
  T[number] extends infer Value
    ? Value extends MeshPhase
      ? `${Value}`
      : never
    : never;

export type TupleRec<T, N extends number, Acc extends readonly T[] = []> =
  Acc['length'] extends N
    ? Acc
    : TupleRec<T, N, readonly [ ...Acc, T ]>;

export type TemplateCode<T extends string> = `mesh.${T}`;

export type EventPayloadFromEnvelope<T> = T extends MeshRuntimeEventEnvelope<infer _K, infer Payload> ? Payload : never;

export const normalizePriority = (value: number): MeshPriority => {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return 0;
  if (rounded < 0) return 0;
  if (rounded > 5) return 5;
  return rounded as MeshPriority;
};

export const normalizeWeightedPriority = (value: number, cap = 5): MeshPriority => normalizePriority(value * cap);

export const isCriticalSignal = (severity: MeshPriority): boolean => severity >= 4;

export const phaseToSignalClass = (phase: MeshPhase): MeshSignalClass =>
  phase === 'execute' || phase === 'plan'
    ? 'warning'
    : phase === 'observe'
      ? 'critical'
      : 'baseline';

export const asMeshNodeId = (value: string): MeshNodeId => `mesh-node:${value}` as MeshNodeId;
export const asMeshRunId = (tenant: string, tag: string): MeshRunId => `tenant-${tenant}-${tag}` as MeshRunId;
export const asMeshPluginId = (value: string): MeshPluginId => `plugin:${value}` as MeshPluginId;
export const asMeshWaveId = (runId: MeshRunId, phase: MeshPhase, index: number): MeshWaveId =>
  `${runId}:${phase}:${index}` as MeshWaveId;
export const asMeshCommandId = (runId: MeshRunId, nodeId: MeshNodeId, order: number): MeshCommandId =>
  `${runId}:${nodeId}:${order}` as MeshCommandId;
export const asMeshWaveCommandId = (runId: MeshRunId, waveId: MeshWaveId, order: number): MeshWaveCommandId =>
  `${runId}:${waveId}:cmd-${order}` as MeshWaveCommandId;
export const asMeshEventId = (runId: MeshRunId, phase: MeshPhase, index: number): MeshEventId => `${runId}:${phase}:${index}` as MeshEventId;
export const asMeshPolicyId = (value: string): MeshPolicyId => `policy:${value}` as MeshPolicyId;
export const asMeshRuntimeMarker = <TPhase extends MeshPhase>(phase: TPhase): `phase:${TPhase}` => `phase:${phase}`;

export const isMeshPluginName = (value: string): value is MeshPluginName => value.startsWith('fusion-plugin:');

export const asSignalEnvelope = <TPayload>(value: {
  readonly runId: MeshRunId;
  readonly phase: MeshPhase;
  readonly source: MeshNodeId;
  readonly target?: MeshNodeId;
  readonly class: MeshSignalClass;
  readonly severity: MeshPriority;
  readonly payload: TPayload;
}): MeshSignalEnvelope<TPayload> => ({
  ...value,
  id: asMeshEventId(value.runId, value.phase, Date.now()),
  createdAt: new Date().toISOString(),
});

export const asRuntimeDigest = (input: MeshRuntimeInput): string =>
  `${input.phases.join('|')}|${input.nodes.length}|${input.edges.length}|${input.pluginIds.length}`;

export const toPolicyWindow = (policy: MeshPolicy): readonly MeshPolicyWindow[] =>
  (Object.entries(policy.phaseGating) as [MeshPhase, boolean][]).map(([phase, enabled]) => ({
    phase,
    enabled,
    priorityCutoff: enabled ? policy.maxConcurrency : 0,
  }));

export const defaultTopology: MeshRuntimeBlueprint & { readonly phasePath: MeshPhaseString<MeshRuntimeBlueprint['phases']> } = {
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
  maxWaveLength: 9,
  concurrency: 3,
  phasePath: 'ingest',
} satisfies MeshRuntimeBlueprint & { readonly phasePath: MeshPhaseString<MeshRuntimeBlueprint['phases']> };

export const meshPluginVersions = ['1.0.0', '1.1.0', '2.0.0'] as const;

export const meshSignalEnvelopeKind = <TPayload>(seed: MeshRuntimeEventEnvelope<`mesh-${string}`, TPayload>): `mesh-${string}` =>
  seed.kind;
