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

export type MeshPluginName = `fusion-plugin:${string}`;

export type MeshPhaseMarker = `phase:${MeshPhase}`;

export interface MeshNode {
  readonly id: MeshNodeId;
  readonly role: MeshNodeRole;
  readonly score: number;
  readonly phase: MeshPhase;
  readonly active: boolean;
  readonly metadata: Record<string, unknown>;
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
  readonly commandId: Brand<string, 'mesh-command'>;
  readonly runId: MeshRunId;
  readonly nodeId: MeshNodeId;
  readonly action: 'start' | 'pause' | 'resume' | 'finish';
  readonly actor: string;
  readonly rationale: string;
}

export interface MeshWave {
  readonly id: MeshWaveId;
  readonly runId: MeshRunId;
  readonly commandIds: readonly Brand<string, 'mesh-wave-command'>[];
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
  readonly maxConcurrency: number;
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

export type MeshPluginInputShape<T> = {
  readonly [K in keyof T]: T[K];
};

export interface MeshPluginContract<TInput = unknown, TOutput = unknown> {
  readonly manifest: MeshManifestEntry;
  readonly input: MeshPluginInputShape<TInput>;
  readonly output: MeshPluginInputShape<TOutput>;
}

export interface MeshExecutionContext {
  readonly runId: MeshRunId;
  readonly topology: MeshTopology;
  readonly policy: MeshPolicy;
  readonly startedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AnyMeshPlugin = MeshPlugin<any, any>;

export interface MeshRuntimeEvent {
  readonly runId: MeshRunId;
  readonly phase: MeshPhase;
  readonly marker: MeshPhaseMarker;
  readonly payload: Record<string, unknown>;
}

export interface MeshRunSummary {
  readonly runId: MeshRunId;
  readonly phaseCount: number;
  readonly nodeCount: number;
  readonly waveCount: number;
  readonly criticality: MeshPriority;
  readonly metrics: readonly MeshSignalEnvelope[];
}

export interface MeshPlanRecord {
  readonly pluginId: MeshPluginId;
  readonly rank: MeshPriority;
  readonly reasons: readonly string[];
}

export type PluginRecordMap<T extends readonly MeshManifestEntry[]> = {
  [K in T[number] as K['name']]: K;
};

export type PluginName<T> = T extends { readonly name: infer Name } ? Name : never;

export type PluginInputOf<T> = T extends MeshPlugin<infer I, any> ? I : never;

export type PluginOutputOf<T> = T extends MeshPlugin<any, infer O> ? O : never;

export type NodeLookup<T, TId extends MeshNodeId> = T extends readonly MeshNode[]
  ? T[number] & { id: TId }
  : never;

export interface MeshPluginContext {
  readonly pluginId: MeshPluginId;
  readonly runId: MeshRunId;
  readonly nodeIndex: ReadonlyMap<MeshNodeId, MeshNode>;
  readonly signalSink: (signal: MeshSignalEnvelope) => void;
}

export interface MeshPlugin<TInput = unknown, TOutput = unknown> {
  readonly manifest: MeshManifestEntry;
  readonly configure: (topology: MeshTopology) => MeshExecutionContext;
  readonly run: (input: MeshPluginInputShape<TInput>, context: MeshPluginContext) => Promise<MeshPluginInputShape<TOutput>>;
  readonly dispose?: () => Promise<void> | void;
}

export type MeshRuntimeInput = {
  readonly phases: readonly MeshPhase[];
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
  readonly pluginIds: readonly MeshPluginId[];
};

export type MeshRuntimeEventEnvelope<TType extends string, TPayload = unknown> = {
  readonly kind: TType;
  readonly phase: MeshPhase;
  readonly payload: TPayload;
  readonly timestamp: string;
};

export interface MeshTelemetryPoint {
  readonly key: `mesh.${string}`;
  readonly value: number;
  readonly runId: MeshRunId;
  readonly timestamp: string;
}

export type RenamedMetricMap<TRecord extends Record<string, number>> = {
  [K in keyof TRecord as `mesh.${Extract<K, string>}`]: TRecord[K];
};

export type EventPayloadFromTopology<T> = T extends MeshRuntimeEventEnvelope<infer _K, infer P> ? P : never;

export type InferPluginInput<T> = T extends MeshPlugin<infer I, unknown> ? I : never;

export type InferPluginOutput<T> = T extends MeshPlugin<unknown, infer O> ? O : never;

export type MeshNodeSequence<T extends readonly MeshNode[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends MeshNode
      ? readonly [Head, ...MeshNodeSequence<Tail & readonly MeshNode[]>]
      : readonly []
    : readonly [];

export type RecursiveTuple<T, Max extends number, Acc extends readonly unknown[] = []> =
  Acc['length'] extends Max
    ? Acc
    : RecursiveTuple<T, Max, [...Acc, T]>;

export type TemplateEventCode<TEvent> = TEvent extends { readonly kind: infer Kind }
  ? Kind extends string
    ? `mesh-event:${Kind}`
    : never
  : never;

export const normalizePriority = (value: MeshPriority): MeshPriority => (value < 0 ? 0 : value > 5 ? 5 : value);

export const isCriticalSignal = (severity: MeshPriority): boolean => severity >= 4;

export const phaseToMetric = (phase: MeshPhase): MeshSignalClass =>
  phase === 'execute' || phase === 'plan' ? 'warning' : phase === 'observe' ? 'critical' : 'baseline';

export const makeNodeId = (scope: string, id: string): MeshNodeId => `${scope}:${id}` as MeshNodeId;

export const makeRunId = (tenant: string, tag: string): MeshRunId => `tenant-${tenant}-${tag}` as MeshRunId;

export const runWithMarker = <T>(marker: MeshPhaseMarker, value: T): { marker: MeshPhaseMarker; value: T } => ({
  marker,
  value,
});

export const defaultTopology = {
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
  maxWaveLength: 9,
  concurrency: 2,
} as const satisfies MeshRuntimeInput;

export const meshPluginVersions = ['1.0.0', '1.1.0', '2.0.0'] as const;

export const isMeshPluginName = (name: string): name is MeshPluginName =>
  name.startsWith('fusion-plugin:');

export const pluginNameFromManifest = (manifest: MeshManifestEntry): MeshPluginName => manifest.name;

