import { Brand } from '@shared/type-level';

export type TimelineRuntimeNamespace<TNamespace extends string> = `recovery:${TNamespace}`;

export type TimelineResourceKind =
  | 'timeline'
  | 'segment'
  | 'phase'
  | 'plugin'
  | 'policy'
  | 'session';

export type RuntimeId<TKind extends TimelineResourceKind, TSuffix extends string = string> = Brand<
  `${TKind}::${TSuffix}`,
  `timeline-runtime-${TKind}`
>;

export type RuntimeKey<T extends string> = `runtime-${T}`;

export type RecursiveSegments<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? [Brand<Head & string, 'segment'>, ...RecursiveSegments<Tail>]
  : [];

export type SegmentMap<T extends Record<string, unknown>> = {
  [Key in keyof T as T[Key] extends Function
    ? never
    : Key & string]: RuntimeAttribute<T[Key]>;
};

export type RuntimeAttribute<T> = T extends readonly [
  infer A,
  ...infer B
]
  ? {
      readonly kind: 'tuple';
      readonly values: RecursiveSegments<readonly [A, ...B]>;
    }
  : T extends Record<string, unknown>
    ? {
        readonly kind: 'record';
        readonly values: SegmentMap<T>;
      }
    : {
        readonly kind: 'value';
        readonly values: Brand<string, 'runtime-attribute'>;
      };

export interface RuntimeTokenParts<T extends string> {
  readonly namespace: TimelineRuntimeNamespace<T>;
  readonly channel: RuntimeKey<T>;
  readonly digest: Brand<string, 'runtime-token-digest'>;
}

export interface RuntimeToken<T extends string> {
  readonly raw: RuntimeId<TimelineResourceKind, T>;
  readonly namespace: TimelineRuntimeNamespace<T>;
  readonly channel: RuntimeKey<T>;
  readonly parts: RuntimeTokenParts<T>;
}

export function buildTokenParts<T extends string>(raw: T): RuntimeTokenParts<T> {
  const [namespace, channel] = raw.split('#', 2);
  return {
    namespace: namespace as TimelineRuntimeNamespace<T>,
    channel: `runtime-${channel ?? 'default'}` as RuntimeKey<T>,
    digest: `${channel ?? 'default'}` as RuntimeTokenParts<T>['digest'],
  };
}

export function mintRuntimeId<TKind extends TimelineResourceKind, TNamespace extends string>(
  kind: TKind,
  namespace: TNamespace,
): RuntimeId<TKind, TNamespace> {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${kind}::${namespace}:${stamp}` as RuntimeId<TKind, TNamespace>;
}

export function splitRuntimeId(id: string): {
  namespace: string;
  suffix: string;
} {
  const [namespace, suffix] = id.split('::', 2);
  return {
    namespace: namespace ?? '',
    suffix: suffix ?? '',
  };
}

export const timelineResourceKinds = ['timeline', 'segment', 'phase', 'plugin', 'policy', 'session'] as const satisfies readonly TimelineResourceKind[];

export function isTimelineRuntimeId(value: string): value is RuntimeId<TimelineResourceKind> {
  return value.includes('::') && value.includes(':');
}

export type NamespaceByKind<K extends TimelineResourceKind> = Extract<TimelineResourceKind, K>;

export function createRuntimeLabel<K extends TimelineResourceKind>(kind: K, namespace: string): RuntimeId<K> {
  const token = mintRuntimeId(kind, namespace);
  return token as RuntimeId<K>;
}

export function normalizeNamespace<T extends string>(value: T): Brand<`namespace:${T}`, 'runtime-namespace'> {
  return `namespace:${value}` as Brand<`namespace:${T}`, 'runtime-namespace'>;
}
