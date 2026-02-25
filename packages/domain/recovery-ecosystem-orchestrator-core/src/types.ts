import type { NoInfer } from '@shared/type-level';
import type { Brand } from '@shared/core';
import type { PluginId, RunId, TenantId, WorkspaceId, TenantWorkspace, SignalId } from './brands.js';
import type { PluginName } from '@shared/typed-orchestration-core';

type Primitive = null | undefined | string | number | boolean | bigint | symbol;

export type DeepMerge<A, B> = A extends Primitive
  ? B
  : B extends Primitive
    ? A
    : A & {
      [K in keyof B]: K extends keyof A ? DeepMerge<A[K], B[K]> : B[K];
    };

export type RecursiveTuple<
  TTuple extends readonly unknown[],
  TAccumulator extends readonly unknown[] = [],
> = TTuple extends readonly [infer Head, ...infer Tail]
  ? RecursiveTuple<Tail, readonly [...TAccumulator, Head]>
  : TAccumulator;

export type TailTuple<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Tail] ? Tail : readonly [];
export type HeadTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer _] ? Head : never;

export type PathConcat<TPrefix extends string, TSuffix extends string> = TPrefix extends ''
  ? TSuffix
  : TSuffix extends ''
    ? TPrefix
    : `${TPrefix}.${TSuffix}`;

export type ObjectLeaves<T, TPrefix extends string = ''> = T extends ReadonlyArray<unknown>
  ? never
  : T extends Record<string, unknown>
    ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? PathConcat<TPrefix, K> | PathConcat<TPrefix, K & string> | PathConcat<PathConcat<TPrefix, K>, ObjectLeaves<T[K]>>
        : PathConcat<PathConcat<TPrefix, ''>, K>;
    }[keyof T & string]
    : never;

export type OptionalizeIf<T, TCondition, TValue> = T extends TCondition ? TValue : never;

export type KeyByTag<
  TSource extends Record<string, unknown>,
  TPrefix extends string = '',
> = {
  [K in keyof TSource as `${TPrefix}${Extract<K, string>}`]: TSource[K];
};

export type FlattenRecord<TSource extends Record<string, unknown>> = TSource[keyof TSource];

export type PluginInputEnvelope<
  TInput extends Record<string, unknown>,
  TName extends PluginName = PluginName,
  TVersion extends string = `v${number}.${number}.${number}`,
> = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly runId: RunId;
  readonly pluginName: TName;
  readonly pluginVersion: TVersion;
  readonly payload: NoInfer<TInput>;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type PluginOutputEnvelope<TOutput extends Record<string, unknown>> = {
  readonly pluginId: PluginId;
  readonly payload: TOutput;
  readonly generatedSignals: readonly SignalId[];
  readonly correlation: TenantWorkspace;
};

export interface PluginRuntimeContext {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly startedAt: string;
  readonly correlation: TenantWorkspace;
  readonly stage: 'discover' | 'model' | 'simulate' | 'optimize' | 'execute' | 'verify' | 'archive';
  readonly pluginRun?: string;
}

export type StageTimeline<TValues extends readonly string[]> = {
  readonly stages: TValues;
  readonly orderedStages: TValues extends readonly (infer Stage extends string)[] ? readonly Stage[] : readonly string[];
  readonly index: {
    readonly [K in TValues[number] as K & string]: number;
  };
};

export type MeshPluginNamespace = `recovery-mesh:${string}`;

export const DEFAULT_STAGES = [
  'discover',
  'model',
  'simulate',
  'optimize',
  'execute',
  'verify',
  'archive',
] as const satisfies readonly PluginRuntimeContext['stage'][];

export type StageTuple<TContext extends PluginRuntimeContext = PluginRuntimeContext> = typeof DEFAULT_STAGES;
export type StageName = StageTuple[number];

export type PipelineConstraint<TPayload> = readonly [
  PluginTagConstraint<TPayload>,
  ...PluginTagConstraint<TPayload>[],
];

export type PluginTagConstraint<TPayload> = TPayload extends { pluginId: infer TPluginId }
  ? Extract<TPluginId, string>
  : string;

export type ExtractPluginTag<T extends { pluginId: string }> = T['pluginId'];

export type WithTenantContext<T extends Record<string, unknown>> = T & {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
};

export type Awaitable<T> = T | Promise<T>;

export type AsyncReturn<T extends (...args: readonly unknown[]) => unknown> = T extends (...args: any[]) => infer TReturn
  ? Awaitable<TReturn>
  : never;

export type ConditionalKeys<T, TValue> = {
  [K in keyof T]: T[K] extends TValue ? K : never;
}[keyof T];

export interface MeshPolicy {
  readonly id: Brand<string, 'EcosystemPolicyId'>;
  readonly labels: readonly string[];
  readonly tags: readonly Brand<string, 'EcosystemPolicyTag'>[];
}

export type MergeBuckets<TBuckets extends readonly MeshPolicy[]> = {
  [K in keyof TBuckets]: TBuckets[K] extends MeshPolicy ? TBuckets[K]['labels'] : never;
} extends infer TMapped
  ? TMapped extends Record<string, readonly string[]>
    ? { [K in keyof TMapped]: TMapped[K][number] }
    : never
  : never;

export type PipelineInputRecord<
  TPlugins extends readonly { readonly name: string; readonly input: Record<string, unknown> }[],
> = {
  [K in TPlugins[number] as K['name']]: K['input'];
};

export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

export interface TimelineMetrics {
  readonly plannedAt: string;
  readonly startedAt: string;
  readonly estimatedFinishAt: string;
  readonly elapsedMs: number;
}

export interface PlanSnapshot<
  TInputs extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly input: TInputs;
  readonly output: TOutput;
  readonly metrics: TimelineMetrics;
}

export type RenameKeys<T> = {
  [K in keyof T as `${Extract<K, string>}_${K extends string ? K : 'unknown'}`]: T[K];
};

export type RecursivePartial<T> = T extends Primitive
  ? T
  : T extends Array<infer TValue>
    ? readonly RecursivePartial<TValue>[]
    : T extends Map<infer K, infer V>
      ? Map<K, RecursivePartial<V>>
      : T extends Set<infer TValue>
        ? Set<RecursivePartial<TValue>>
        : T extends object
          ? { [K in keyof T]?: RecursivePartial<T[K]> }
          : T;

export type ExpandPluginRecord<TSource extends Record<string, Record<string, unknown>>> = {
  [K in keyof TSource]: {
    readonly key: K;
    readonly payload: TSource[K];
  };
}[keyof TSource];
