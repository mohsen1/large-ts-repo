import { Brand, withBrand, type Graph } from '@shared/core';
import type { NoInfer, RecursivePath } from '@shared/type-level';
import type { NodeId } from '@shared/core';

export type SagaNamespace = `saga:${string}`;
export type SagaVersion = `${number}.${number}.${number}`;
export type SagaRunId = Brand<string, 'SagaRunId'>;
export type SagaRunStepId = Brand<string, 'SagaRunStepId'>;
export type SagaStepId = Brand<string, 'SagaStepId'>;
export type SagaRunPolicyId = Brand<string, 'SagaRunPolicyId'>;

export type SagaPhase = 'prepare' | 'activate' | 'execute' | 'audit' | 'retire';
export type SagaEventTag = `tag:${string}`;
export type SagaPluginTag = `plugin:${string}`;
export type SagaTopic = `topic:${string}`;
export type SagaEventType<
  TNamespace extends SagaNamespace = SagaNamespace,
  TPhase extends SagaPhase = SagaPhase,
> = `${TNamespace}::${TPhase}`;

export interface SagaErrorScope {
  readonly code: string;
  readonly plugin: string;
  readonly phase: SagaPhase;
  readonly message: string;
  readonly seenAt: string;
}

export interface SagaPluginOptions {
  readonly namespace: SagaNamespace;
  readonly enabled: boolean;
  readonly priority: 'high' | 'normal' | 'low';
  readonly timeoutMs: number;
}

export interface SagaPluginDescriptor {
  readonly name: string;
  readonly version: SagaVersion;
  readonly enabled: boolean;
}

export interface PluginOutput<T = unknown> {
  readonly pluginId: SagaPluginTag;
  readonly ready: boolean;
  readonly startedAt: string;
  readonly output: T;
}

export interface SagaPluginDefinition<
  TPluginName extends string = string,
  TContext extends object = SagaContext,
  TOutput = unknown,
> {
  readonly pluginName: SagaPluginTag | `plugin:${TPluginName}`;
  readonly dependencies: readonly SagaPluginTag[];
  readonly setup: (
    context: TContext,
    options: NoInfer<SagaPluginOptions>,
  ) => Promise<PluginOutput<TOutput>>;
  readonly teardown?: (context: TContext, output: PluginOutput<TOutput>) => Promise<void>;
}

export interface SagaContext {
  readonly runId: SagaRunId;
  readonly runNamespace: SagaNamespace;
  readonly phase: SagaPhase;
  readonly startedAt: string;
  readonly traceId: Brand<string, 'SagaTraceId'>;
}

export interface SagaContextValue<TMeta extends { readonly label: string }> {
  readonly meta: TMeta;
  readonly timestamp: string;
  readonly phase: SagaPhase;
}

export interface SagaMeta {
  readonly label: string;
  readonly tenant: string;
}

export type SagaError = Brand<string, 'SagaError'>;
export interface SagaIssue {
  readonly code: SagaError;
  readonly message: string;
}

export interface SagaEventEnvelope<
  TName extends SagaNamespace = SagaNamespace,
  TPayload = unknown,
> {
  readonly eventId: Brand<string, `event:${TName}`>;
  readonly namespace: TName;
  readonly kind: SagaEventType<TName>;
  readonly payload: TPayload;
  readonly recordedAt: string;
  readonly tags: readonly SagaEventTag[];
}

export type EventPath<T> = RecursivePath<T>;
export type EventPayloadTuple<T extends Record<string, unknown>> = {
  [K in keyof T & string]: readonly [K, T[K]];
}[keyof T & string][];

export type StageTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...StageTuple<Rest>]
  : readonly [];

export type TailTuple<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : readonly [];
export type HeadTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...unknown[]] ? Head : never;
export type ShiftedTuple<T extends readonly unknown[]> = [HeadTuple<T>, ...TailTuple<T>];

export type RecursiveTupleMap<T extends readonly unknown[], TAcc extends readonly unknown[] = readonly []> = T extends readonly [
  infer Head,
  ...infer Rest,
]
  ? RecursiveTupleMap<Rest, readonly [...TAcc, Head]>
  : TAcc;

export type SagaPluginOutputMap<TDefinitions extends Record<string, SagaPluginDefinition<string, object, unknown>>> = {
  [K in keyof TDefinitions]: TDefinitions[K] extends SagaPluginDefinition<string, object, infer TOutput>
    ? PluginOutput<TOutput>
    : never;
};

export type KeyedPluginOutput<TDefinitions extends Record<string, SagaPluginDefinition<string, object, unknown>>> = {
  [K in keyof TDefinitions as `plugins/${string & K}`]: SagaPluginOutputMap<TDefinitions>[K];
};

export type SagaPathValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? SagaPathValue<T[Head], Rest>
    : unknown
  : P extends keyof T
    ? T[P]
    : unknown;

export const sagaPhases: readonly SagaPhase[] = ['prepare', 'activate', 'execute', 'audit', 'retire'];

export const defaultSagaPluginDescriptor: SagaPluginDescriptor = {
  name: 'saga-runtime',
  version: '1.0.0',
  enabled: true,
};

export const isSagaPhase = (value: string): value is SagaPhase => sagaPhases.includes(value as SagaPhase);

export const makeRunId = (seed: string): SagaRunId =>
  withBrand(`${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 'SagaRunId');

export const makeRunStepId = (namespace: string, index: number): SagaRunStepId =>
  withBrand(`${namespace}::step:${index}`, 'SagaRunStepId');

export const makeStepId = (namespace: string, index: number): SagaStepId =>
  withBrand(`${namespace}::step:${index}`, 'SagaStepId');

export const makePolicyId = (namespace: string, seed: string): SagaRunPolicyId =>
  withBrand(`policy:${namespace}:${seed}`, 'SagaRunPolicyId');

export const asPhase = <T extends string>(value: T): SagaPhase => (isSagaPhase(value) ? value : 'prepare');

export const toPhaseTag = <T extends SagaPhase>(phase: T): SagaEventTag => `tag:${phase}` as SagaEventTag;

export const buildEvent = <TNamespace extends SagaNamespace, TPayload>(
  namespace: TNamespace,
  phase: SagaPhase,
  runId: SagaRunId,
  payload: TPayload,
  tags: readonly SagaEventTag[] = [],
): SagaEventEnvelope<TNamespace, TPayload> => ({
  eventId: `${runId}:${namespace}:${phase}:${Date.now()}` as Brand<string, `event:${TNamespace}`>,
  namespace,
  kind: `${namespace}::${phase}`,
  payload,
  recordedAt: new Date().toISOString(),
  tags: [...tags, toPhaseTag(phase)] as readonly SagaEventTag[],
});

export const phaseFromTag = (tag: SagaEventTag): SagaPhase => {
  if (tag === 'tag:prepare') return 'prepare';
  if (tag === 'tag:activate') return 'activate';
  if (tag === 'tag:execute') return 'execute';
  if (tag === 'tag:audit') return 'audit';
  return 'retire';
};

export const asGraphTuple = <T extends readonly SagaEventEnvelope[]>(events: T): Graph<NodeId, number> => {
  const nodes = events.map((event, index) =>
    withBrand(`${event.namespace}::${event.kind}::${index}`, 'NodeId'),
  );
  const unique = [...new Set(nodes)];
  const edges = unique.slice(0, -1).map((from, index) => ({
    from,
    to: unique[index + 1] ?? from,
    weight: 1,
  }));
  return { nodes: unique, edges };
};

export const mapByPhase = <T extends { phase: SagaPhase }>(items: readonly T[]): { [K in SagaPhase]: readonly T[] } => {
  const buckets: { [K in SagaPhase]: T[] } = {
    prepare: [],
    activate: [],
    execute: [],
    audit: [],
    retire: [],
  };
  for (const item of items) {
    buckets[item.phase].push(item);
  }
  return buckets;
};

export const flattenTuple = <T extends readonly unknown[]>(tuple: T): StageTuple<T> => [...tuple] as unknown as StageTuple<T>;

export const resolvePath = <T>(item: T, path: EventPath<T>): unknown => {
  const parts = String(path).split('.');
  let current: unknown = item;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

export const normalizeTags = (tags: readonly SagaEventTag[]): readonly SagaEventTag[] => {
  return [...new Set(tags)]
    .sort()
    .map((tag, index, list) => (index === list.indexOf(tag) ? (tag as SagaEventTag) : tag));
};

export const toNamespace = <T extends string>(value: T): SagaNamespace =>
  (value.startsWith('saga:') ? value : `saga:${value}`) as SagaNamespace;
