import type { NamespaceTag } from './identifiers';

type SegmentList<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...SegmentList<Tail>]
  : readonly [TPath];

type JoinSegments<TSegments extends readonly string[]> = TSegments extends readonly [infer Head extends string, ...infer Tail extends string[]]
  ? Tail['length'] extends 0
    ? Head
    : `${Head}/${JoinSegments<Tail>}`
  : '';

type LastSegment<TSegments extends readonly string[]> = TSegments extends readonly [...unknown[], infer Last extends string]
  ? Last
  : never;

export type RoutedNamespace<TValues extends readonly string[]> = NamespaceTag<
  `route:${JoinSegments<TValues> extends '' ? 'global' : JoinSegments<TValues>}`
>;

export type ExtractScope<TValue extends NamespaceTag> = TValue extends `${infer Prefix}:${infer Scope}` ? Scope : never;

export interface NamespaceRoute<TNamespace extends NamespaceTag = NamespaceTag> {
  readonly namespace: TNamespace;
  readonly scope: ExtractScope<TNamespace>;
  readonly segments: readonly string[];
}

export interface NamespaceSignature {
  readonly namespace: NamespaceTag;
  readonly value: string;
  readonly hash: string;
}

export type SegmentPath<TPath extends string> = SegmentList<TPath>;
export type SegmentPrefix<TValues extends string> = TValues extends `${infer Head}/${string}` ? Head : TValues;

export interface NamespaceRouteOptions {
  readonly trim?: boolean;
  readonly uppercase?: boolean;
}

const sanitize = (value: string): string => value.trim().replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');

const splitSegments = (value: string): readonly string[] => sanitize(value).split('/').filter(Boolean);

const hashCode = (value: string): string => {
  let hash = 2166136261;
  for (const code of value) {
    hash ^= code.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `h-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const parseNamespaceRoute = <TPath extends string>(path: TPath): SegmentPath<TPath> => {
  return splitSegments(path) as SegmentPath<TPath>;
};

export const joinNamespaceRoute = <TValues extends readonly string[]>(...values: TValues): RoutedNamespace<TValues> => {
  const normalized = values.flatMap((value) => splitSegments(value));
  const route = normalized.join('/');
  return (`namespace:${route || 'global'}` as `namespace:${string}`) as RoutedNamespace<TValues>;
};

export const normalizeNamespace = (
  value: string,
  options: NamespaceRouteOptions = {},
): NamespaceTag => {
  const segments = splitSegments(value).map((segment) => {
    const lowered = segment.toLowerCase();
    return options.uppercase ? lowered.toUpperCase() : lowered;
  });
  const route = sanitize(segments.join('/'));
  return (`namespace:${route || 'global'}` as NamespaceTag) as NamespaceTag;
};

export const namespaceFromSegments = <TValues extends readonly string[]>(...values: TValues): RoutedNamespace<TValues> =>
  joinNamespaceRoute(...values);

export const namespaceSignature = (namespace: NamespaceTag, salt = 'default'): NamespaceSignature => {
  const scope = namespace.slice(namespace.indexOf(':') + 1) as string;
  return {
    namespace,
    value: `${salt}:${scope}`,
    hash: hashCode(`${salt}:${scope}`),
  };
};

export const namespaceScope = <TNamespace extends NamespaceTag>(namespace: TNamespace): NamespaceRoute<TNamespace> => {
  const scope = namespace.slice(namespace.indexOf(':') + 1);
  return {
    namespace,
    scope: scope as ExtractScope<TNamespace>,
    segments: splitSegments(scope),
  };
};

export const namespaceTail = <TPath extends string>(path: TPath): SegmentPrefix<TPath> => {
  const segments = parseNamespaceRoute(path);
  const last = [...segments].reverse()[0];
  return (last ?? 'global') as SegmentPrefix<TPath>;
};

export const namespaceHead = <TPath extends string>(path: TPath): SegmentPath<TPath>[0] =>
  parseNamespaceRoute(path)[0];

export const namespaceTree = (namespace: NamespaceTag): readonly string[] => {
  const scope = namespace.slice(namespace.indexOf(':') + 1);
  return splitSegments(scope).toSpliced(0, 0, 'namespace');
};

export const isNamespaceMatch = (left: NamespaceTag, right: NamespaceTag): boolean => {
  return left.toLowerCase() === right.toLowerCase();
};
