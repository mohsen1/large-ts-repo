import { z } from 'zod';

type Brand<T, B extends string> = T & { readonly __brand: B };

export const runtimePrefixes = ['ws', 'run', 'tenant', 'lane', 'plugin', 'policy', 'signal'] as const;

export type RuntimePrefix = (typeof runtimePrefixes)[number];

export type RuntimeId<TPrefix extends RuntimePrefix, TSuffix extends string = string> = Brand<`${TPrefix}:${TSuffix}`, `${TPrefix}Id`>;

export type WorkspaceId = RuntimeId<'ws'>;
export type RunId = RuntimeId<'run'>;
export type TenantId = RuntimeId<'tenant'>;
export type LaneId = RuntimeId<'lane'>;
export type PluginId = RuntimeId<'plugin'>;
export type PolicyId = RuntimeId<'policy'>;
export type SignalId = RuntimeId<'signal'>;

const idSuffixPattern = /^([a-z][a-z0-9-]*)(:[a-z0-9-.]*)?$/i;

const isValidIdSuffix = (value: string): value is string => idSuffixPattern.test(value);

export interface RuntimeIdParser {
  parse(value: string): RuntimeId<RuntimePrefix>;
}

export const idSchema = z
  .string()
  .regex(/^[a-z]+:[^\s]+$/)
  .transform((value: string): RuntimeId<RuntimePrefix> => value as RuntimeId<RuntimePrefix>);

export const parseRuntimeId = <TPrefix extends RuntimePrefix>(prefix: TPrefix, value: string): RuntimeId<TPrefix> => {
  if (!value.startsWith(`${prefix}:`)) {
    throw new Error(`Invalid runtime id ${value} for prefix ${prefix}`);
  }

  const suffix = value.slice(prefix.length + 1);
  if (!isValidIdSuffix(suffix)) {
    throw new Error(`Invalid runtime id suffix: ${suffix}`);
  }

  return value as RuntimeId<TPrefix>;
};

export const parseWorkspaceId = (value: string): WorkspaceId => parseRuntimeId('ws', value);
export const parseRunId = (value: string): RunId => parseRuntimeId('run', value);
export const parseTenantId = (value: string): TenantId => parseRuntimeId('tenant', value);
export const parseLaneId = (value: string): LaneId => parseRuntimeId('lane', value);
export const parsePluginId = (value: string): PluginId => parseRuntimeId('plugin', value);
export const parsePolicyId = (value: string): PolicyId => parseRuntimeId('policy', value);
export const parseSignalId = (value: string): SignalId => parseRuntimeId('signal', value);

export const runtimeId = Object.freeze({
  ws: (tenant: string, id: string): WorkspaceId => `ws:${tenant}:${id}` as WorkspaceId,
  run: (tenant: string, id: string): RunId => `run:${tenant}:${id}` as RunId,
  tenant: (id: string): TenantId => `tenant:${id}` as TenantId,
  lane: (tenant: string, id: string): LaneId => `lane:${tenant}:${id}` as LaneId,
  plugin: (scope: string, name: string): PluginId => `plugin:${scope}:${name}` as PluginId,
  policy: (name: string, version: string): PolicyId => `policy:${name}:${version}` as PolicyId,
  signal: (source: string, metric: string): SignalId => `signal:${source}:${metric}` as SignalId,
});

export type IdLike = WorkspaceId | RunId | TenantId | LaneId | PluginId | PolicyId | SignalId;

export type IdRecord = {
  [K in RuntimePrefix as `${K}Id`]: RuntimeId<K>;
};

export const isIdLike = (value: string): value is IdLike => {
  if (typeof value !== 'string' || !value.includes(':')) {
    return false;
  }

  const [prefix] = value.split(':', 1);
  return runtimePrefixes.includes(prefix as RuntimePrefix);
};

export type ParsedId<P extends RuntimePrefix> = {
  readonly kind: P;
  readonly raw: RuntimeId<P>;
  readonly tenant: string;
  readonly value: string;
};

export const parseRuntimeIdTokens = <TPrefix extends RuntimePrefix>(prefix: TPrefix, value: string): ParsedId<TPrefix> => {
  const parts = value.split(':');
  const raw = parseRuntimeId(prefix, value);
  if (parts.length < 2) {
    throw new Error(`Invalid runtime id tokens: ${value}`);
  }
  return {
    kind: prefix,
    raw,
    tenant: parts[1] ?? 'global',
    value: parts.slice(2).join(':'),
  };
};
