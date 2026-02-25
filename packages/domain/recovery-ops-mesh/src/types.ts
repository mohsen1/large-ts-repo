import type { Brand } from '@shared/core';
import type { DeepReadonly, Merge, RecursivePath } from '@shared/type-level';

export type MeshNodeKind = 'ingest' | 'transform' | 'emit' | 'observer';
export type MeshSignalKind = 'pulse' | 'snapshot' | 'alert' | 'telemetry';
export type MeshPriority = 'low' | 'normal' | 'high' | 'critical';

export type MeshId<K extends string> = Brand<string, `${K}Id`>;
export type MeshNodeId = MeshId<'MeshNode'>;
export type MeshLinkId = MeshId<'MeshLink'>;
export type MeshPlanId = MeshId<'MeshPlan'>;
export type MeshRunId = MeshId<'MeshRun'>;

export type TraceLabel = `trace-${string}`;
export type EventEnvelopeKey<TScope extends string, TKind extends string> = `${TScope}:${TKind}`;

export type StageMetrics = {
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly throughput: number;
  readonly errorRate: number;
};

export interface MeshClock {
  readonly epoch: bigint;
  readonly skewMicros: number;
}

export interface MeshEventEnvelope<TKind extends MeshSignalKind, TPayload> {
  readonly id: Brand<string, 'MeshEventId'>;
  readonly kind: TKind;
  readonly kindKey: EventEnvelopeKey<'mesh-signal', TKind>;
  readonly occurredAt: number;
  readonly payload: TPayload;
  readonly trace: TraceLabel;
  readonly sourceNode: MeshNodeId;
}

export interface MeshNodeConfig<TKind extends MeshNodeKind = MeshNodeKind> {
  readonly id: MeshNodeId;
  readonly label: string;
  readonly kind: TKind;
  readonly tags: readonly string[];
  readonly priority: MeshPriority;
  readonly maxConcurrency: number;
}

export type MeshNodePayload<TConfig extends MeshNodeConfig = MeshNodeConfig> =
  TConfig['kind'] extends 'ingest'
    ? { source: string }
    : TConfig['kind'] extends 'transform'
      ? { mapping: Record<string, string> }
      : TConfig['kind'] extends 'emit'
        ? { targets: readonly string[] }
        : { probes: readonly string[] };

export type MeshNodeContract<T extends MeshNodeConfig = MeshNodeConfig> =
  DeepReadonly<T & {
    payload: MeshNodePayload<T>;
    schemaVersion: `v${number}.${number}`;
  }>;

export interface MeshTopologyEdge {
  readonly id: MeshLinkId;
  readonly from: MeshNodeId;
  readonly to: MeshNodeId;
  readonly weight: number;
  readonly channels: readonly EventEnvelopeKey<string, string>[];
  readonly retryLimit: number;
}

export interface MeshTopology {
  readonly id: MeshPlanId;
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly nodes: readonly MeshNodeContract[];
  readonly links: readonly MeshTopologyEdge[];
  readonly createdAt: number;
}

export type MeshTopologyPath = RecursivePath<MeshTopology>;

export interface MeshRunContext {
  readonly planId: MeshPlanId;
  readonly runId: MeshRunId;
  readonly startedAt: number;
  readonly clock: MeshClock;
  readonly user: Brand<string, 'MeshUserId'>;
  readonly tenant: Brand<string, 'MeshTenant'>;
  readonly locale: string;
}

export interface MeshRunObservation {
  readonly runId: MeshRunId;
  readonly topologyId: MeshPlanId;
  readonly metrics: StageMetrics;
  readonly nodeTimeline: readonly {
    readonly nodeId: MeshNodeId;
    readonly enteredAt: number;
    readonly exitAt?: number;
    readonly status: 'ready' | 'running' | 'succeeded' | 'failed' | 'skipped';
  }[];
}

export interface MeshPlanRecord {
  readonly plan: MeshTopology;
  readonly context: MeshRunContext;
  readonly observations: MeshRunObservation[];
}

export type MeshStepInput<T> = {
  readonly payload: T;
  readonly path: MeshPathTuple;
};

export type MeshPathTuple = readonly [MeshRunId, MeshPlanId, MeshNodeId, ...string[]];
export type MeshPath = MeshPathTuple[number] extends infer V ? Extract<V, string> : never;

export type MeshTuplePrepend<TValue, TTuple extends readonly unknown[]> =
  TTuple extends readonly [...infer Head]
    ? readonly [TValue, ...Head]
    : readonly [TValue];

export type MeshTupleTail<TOther extends readonly unknown[]> =
  TOther extends readonly [any, ...infer Tail] ? Tail : [];

export type MeshTupleConcat<TLeft extends readonly unknown[], TRight extends readonly unknown[]> =
  [...TLeft, ...TRight];

export type MeshTupleZip<TLeft extends readonly unknown[], TRight extends readonly unknown[]> =
  TLeft extends readonly [infer LHead, ...infer LTail]
    ? TRight extends readonly [infer RHead, ...infer RTail]
      ? readonly [[LHead, RHead], ...MeshTupleZip<LTail, RTail>]
      : []
    : [];

export type MeshShape =
  | { readonly kind: 'single' }
  | { readonly kind: 'fork'; readonly branches: readonly MeshShape[] }
  | { readonly kind: 'join'; readonly branches: readonly [MeshShape, ...MeshShape[]] };

export type MeshOutcomeKind<TSignal extends MeshSignalKind = MeshSignalKind> = TSignal;

export type MeshOutcome<TSignal extends MeshSignalKind, T = unknown> = {
  readonly kind: MeshOutcomeKind<TSignal>;
  readonly value: T;
  readonly path: MeshPathTuple;
  readonly generatedAt: number;
};

export type MeshStageSignature<TInput, TOutput> = {
  readonly input: MeshStepInput<TInput>;
  readonly output: MeshOutcome<MeshSignalKind, TOutput>;
};

export type MeshRecordShape<TNode extends MeshNodeConfig = MeshNodeConfig, TPayload = unknown> = {
  readonly node: TNode;
  readonly contract: MeshNodeContract<TNode>;
  readonly payload: TPayload;
};

export type MeshSignalOf<TEnvelope extends MeshEventEnvelope<MeshSignalKind, unknown>> =
  TEnvelope['kind'];

export type MeshSignalPayloadFor<TKind extends MeshSignalKind> =
  TKind extends 'pulse' ? { readonly value: number }
  : TKind extends 'snapshot' ? MeshTopology
  : TKind extends 'alert' ? { readonly severity: MeshPriority; readonly reason: string }
  : { readonly metrics: Record<string, number> };

export type MeshPayloadFor<TKind extends MeshSignalKind = MeshSignalKind> = {
  [TSignal in TKind]: {
    readonly kind: TSignal;
    readonly payload: MeshSignalPayloadFor<TSignal>;
  };
}[TKind];

export type MeshPayloadByKind = {
  [K in MeshSignalKind as `${K & string}Signal`]: Extract<MeshPayloadFor<K>, { readonly kind: K }>;
};

export type MeshEventUnion = {
  [K in MeshSignalKind]: MeshPayloadFor<K>
}[MeshSignalKind];

export type RemapEventKey<TEventMap extends Record<string, unknown>> = {
  [K in keyof TEventMap as K extends string ? `mesh.${K}` : never]: TEventMap[K];
};

export type MeshRuntimeConfig<TPlugins extends readonly string[] = readonly string[]> = {
  readonly namespace: `mesh.${string}`;
  readonly pluginKeys: TPlugins;
  readonly maxInflight: number;
  readonly includeHistory: boolean;
};

export type MeshRuntimeConfigWithDefaults<TConfig extends MeshRuntimeConfig> = Merge<
  {
    readonly pluginKeys: readonly string[];
    readonly maxInflight: 32;
    readonly includeHistory: false;
  },
  TConfig
>;

export const meshKindPrefix = 'mesh:' as const;
export const defaultTopology = {
  name: 'default-mesh',
  version: '1.0.0',
  namespace: `${meshKindPrefix}runtime`,
} as const;

export type MeshRuntimeMetadata<T extends Record<string, unknown>> = {
  readonly [K in keyof T as `meta:${string & K}`]: T[K];
};
