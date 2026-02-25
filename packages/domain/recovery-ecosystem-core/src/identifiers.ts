import type { Brand } from '@shared/type-level';

export type NamespaceTag<TScope extends string = string> = `namespace:${TScope}`;
export type OrchestrationNamespace = NamespaceTag<string>;

export type TenantId = Brand<string, 'TenantId'>;
export type RunId = Brand<string, 'RunId'> & NamespaceTag<'run'>;
export type StageId = Brand<string, 'StageId'> & `stage:${string}`;
export type PluginId = Brand<string, 'PluginId'> & `plugin:${string}`;
export type ArtifactId = Brand<string, 'ArtifactId'> & `artifact:${string}`;
export type PolicyId = Brand<string, 'PolicyId'> & `policy:${string}`;

export type MetricName<TUnit extends string = string> = `metric:${TUnit}`;
export type EventKind<TEvent extends string = string> = `event:${TEvent}`;
export type TraceId = Brand<string, 'TraceId'> & `trace:${string}`;

export type SplitNamespace<TValue extends string> = TValue extends `${infer Head}:${infer Tail}`
  ? [Head, Tail]
  : [TValue, ''];

export type ComposeNamespace<TValues extends readonly string[]> = TValues extends readonly [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? Tail['length'] extends 0
    ? Head
    : `${Head}/${ComposeNamespace<Tail>}`
  : 'namespace:global';

export const asTenantId = (value: string): TenantId => `tenant:${value.trim().toLowerCase()}` as TenantId;
export const asRunId = (value: string): RunId => `run:${value.trim().toLowerCase()}` as RunId;
export const asStageId = (value: string): StageId => `stage:${value.trim().toLowerCase()}` as StageId;
export const asPluginId = (value: string): PluginId => `plugin:${value.trim().toLowerCase()}` as PluginId;
export const asArtifactId = (value: string): ArtifactId => `artifact:${value.trim().toLowerCase()}` as ArtifactId;
export const asPolicyId = (value: string): PolicyId => `policy:${value.trim().toLowerCase()}` as PolicyId;
export const asTraceId = (value: string): TraceId => `trace:${value.trim().toLowerCase()}` as TraceId;

export const composeNamespace = <TValues extends readonly string[]>(
  ...parts: TValues
): ComposeNamespace<TValues & ['namespace', ...TValues]> => {
  const normalized = parts
    .map((part) => part.trim().replace(/\/+$/, '').replace(/^\/+/, ''))
    .filter(Boolean)
    .join('/');
  return `namespace:${normalized || 'global'}` as ComposeNamespace<TValues & ['namespace', ...TValues]>;
};

export const splitNamespace = <TValue extends string>(value: TValue): SplitNamespace<TValue> => {
  if (!value.includes(':')) {
    return [value, ''] as SplitNamespace<TValue>;
  }
  const index = value.indexOf(':');
  return [value.slice(0, index), value.slice(index + 1)] as SplitNamespace<TValue>;
};

export const normalizeToken = <TValue extends string>(value: TValue): `token:${Lowercase<TValue>}` =>
  `token:${value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-')}` as `token:${Lowercase<TValue>}`;

export const asMetricName = <TValue extends string>(value: TValue): MetricName<TValue> =>
  `metric:${value}` as MetricName<TValue>;

export const asEventKind = <TValue extends string>(value: TValue): EventKind<TValue> =>
  `event:${value}` as EventKind<TValue>;

export type NamespaceOf<TPath extends string> = TPath extends `${OrchestrationNamespace}` ? TPath : never;
export type TenantOf<TInput extends TenantId> = TInput & Brand<string, 'TenantRef'>;
