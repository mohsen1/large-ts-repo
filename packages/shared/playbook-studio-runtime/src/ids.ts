import { withBrand, type Brand } from '@shared/core';

export const studioNamespaces = ['tenant', 'workspace', 'artifact', 'run', 'session', 'plugin', 'trace'] as const;
export type StudioNamespace = (typeof studioNamespaces)[number];

export type BrandedId<TScope extends string> = Brand<string, `${Capitalize<TScope>}Id`>;

type Qualified<NS extends StudioNamespace> = Brand<string, `${Capitalize<NS>}Id`>;

export type TenantId = Qualified<'tenant'>;
export type WorkspaceId = Qualified<'workspace'>;
export type ArtifactId = Qualified<'artifact'>;
export type RunId = Qualified<'run'>;
export type SessionId = Qualified<'session'>;
export type PluginId = Qualified<'plugin'>;
export type TraceId = Qualified<'trace'>;

const create = <NS extends StudioNamespace>(namespace: NS, value: string): Qualified<NS> =>
  withBrand(`${namespace}:${value}` as const, `${(namespace[0]!.toUpperCase() + namespace.slice(1)) as `${Capitalize<NS>}`}Id`) as Qualified<NS>;

export const tenantId = (value: string): TenantId => create('tenant', value);
export const workspaceId = (value: string): WorkspaceId => create('workspace', value);
export const artifactId = (value: string): ArtifactId => create('artifact', value);
export const runId = (value: string): RunId => create('run', value);
export const sessionId = (value: string): SessionId => create('session', value);
export const pluginId = (value: string): PluginId => create('plugin', value);
export const traceId = (value: string): TraceId => create('trace', value);

export type SplitIdParts<TValue extends string> = TValue extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...SplitIdParts<Tail>]
  : readonly [TValue];

export const buildIdPath = <
  const TNamespace extends StudioNamespace,
  const TParts extends readonly string[],
>(namespace: TNamespace, ...parts: TParts): readonly [TNamespace, ...TParts, `${number}`] => {
  const depth = String(parts.length) as `${number}`;
  return [namespace, ...parts, depth] as const;
};

export const toPath = (parts: readonly [StudioNamespace, ...string[]]): string => {
  const [namespace, ...tail] = parts;
  tail.pop();
  return `${namespace}:${tail.join('/')}`;
};

export const toDisplayId = (value: Brand<string, string>): string => value.split(':')[1] ?? String(value);
