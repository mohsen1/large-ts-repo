import { Brand, normalizeLimit, withBrand } from '@shared/core';

export type PluginNamespace = Brand<string, 'PluginNamespace'>;
export type PluginVersion = `${number}.${number}.${number}`;
export type PluginKind = `stress-lab/${string}`;
export type PluginEventName = `${PluginKind}:${'pre' | 'post'}:${string}`;
export type PluginDependency = `dep:${string}`;
export type PluginId = Brand<string, 'PluginId'>;

export type PluginTag = Readonly<{
  readonly namespace: PluginNamespace;
  readonly kind: PluginKind;
  readonly version: PluginVersion;
}>;

export type RecursivePath<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? [Head, ...RecursivePath<Rest>]
  : [];

export type JoinedPath<T extends readonly string[], Separator extends string = '.'> =
  T extends readonly [infer Head extends string, ...infer Rest extends readonly string[]]
    ? Rest['length'] extends 0
      ? Head
      : `${Head}${Separator}${JoinedPath<Rest, Separator>}`
    : '';

export const pluginNamespaceSeed = ['recovery', 'stress', 'lab'] as const;

export const canonicalizeNamespace = (value: string): PluginNamespace =>
  withBrand(value.trim().toLowerCase().replace(/\s+/g, '-'), 'PluginNamespace');

export const makePluginNamespace = (parts: readonly string[]): PluginNamespace => {
  const namespace = parts.join(':');
  return canonicalizeNamespace(namespace);
}

export const createPluginId = (namespace: PluginNamespace, kind: PluginKind, name: string): PluginId => {
  return makePluginId(namespace, kind, name);
};

export const buildPluginId = createPluginId;

export const makePluginId = (namespace: PluginNamespace, kind: PluginKind, name: string): PluginId => {
  return withBrand(`${namespace}::${kind}::${name}`, 'PluginId');
};

export const buildPluginVersion = (major: number, minor: number, patch: number): PluginVersion => {
  return `${normalizeLimit(major)}.${normalizeLimit(minor)}.${normalizeLimit(patch)}` as PluginVersion;
};

export const isPluginDependency = (value: string): value is PluginDependency => value.startsWith('dep:');

export const splitNamespace = (namespace: PluginNamespace): RecursivePath<[PluginNamespace]> => {
  return namespace.split(':') as RecursivePath<[PluginNamespace]>;
};

export const buildPath = <T extends readonly string[]>(parts: T): JoinedPath<T> => {
  return parts.join('/') as JoinedPath<T>;
};

export const parsePath = (input: string): readonly string[] => input.split('/') as readonly string[];
