import type { Brand } from '@shared/type-level';
import type { ControlPlaneRoute, ControlPlaneManifest, ControlPlaneConstraint, TimelineMarker } from './types';

export type PluginChannel = 'validator' | 'scheduler' | 'router' | 'telemetry';

export type ChannelTag<T extends PluginChannel = PluginChannel> = `${T}:${string}`;

export type StageName = TimelineMarker['stage'];

export interface BrandedRoute {
  readonly route: ControlPlaneRoute;
  readonly stage: StageName;
}

export interface RegistryRecord {
  readonly pluginId: string;
  readonly channel: ChannelTag;
  readonly stage: StageName;
  readonly addedAt: string;
  readonly tags: string[];
}

export interface RuntimeEnvelope {
  readonly routeId: string;
  readonly tenant: string;
  readonly payload: Record<string, string | number | boolean | null>;
}

export interface ConstraintSnapshot {
  readonly name: string;
  readonly kind: ControlPlaneConstraint['kind'];
  readonly limit: number;
  readonly warningThreshold?: number;
  readonly checked: boolean;
  readonly checkedAt: string;
}

export type InferencePair<T> =
  T extends readonly [infer A, ...infer B]
    ? {
        readonly head: A;
        readonly tail: InferencePair<B extends readonly unknown[] ? B : readonly []>;
      }
    : never;

export type TupleJoin<T extends readonly unknown[]> =
  T extends readonly [infer A, ...infer B]
    ? A extends string
      ? B extends readonly string[]
        ? B['length'] extends 0
          ? A
          : `${A & string}.${TupleJoin<B>}`
        : string
      : string
    : string;

export type Remap<T extends Record<string, unknown>> = {
  [K in keyof T as `value:${string & K}`]: T[K];
};

export type Optionalize<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type BrandAlias<T, B extends string> = Brand<T & string, B>;

export type PluginKind<T extends string> = BrandAlias<T, 'PluginKind'>;

export interface PluginMetadata {
  readonly name: PluginKind<string>;
  readonly vendor: string;
  readonly version: string;
  readonly tags: readonly string[];
}

export interface PluginPayload {
  readonly kind: ChannelTag;
  readonly value: string;
  readonly metrics: Record<string, number>;
}

export type PluginEventMap<T extends Record<string, readonly string[]>> = {
  [K in keyof T & string]: {
    readonly kind: K;
    readonly tags: T[K];
    readonly route: ChannelTag;
  };
};

const routeBrand = <T extends string>(value: T): BrandAlias<T, 'ControlPlaneRoute'> => value as BrandAlias<T, 'ControlPlaneRoute'>;

export const asRoute = (channel: ChannelTag): BrandAlias<string, 'ControlPlaneRoute'> =>
  routeBrand(`${channel}:${Date.now()}`);

export const routeKey = (route: BrandAlias<string, 'ControlPlaneRoute'>): string => String(route);

export const buildEnvelope = (route: ControlPlaneRoute): RuntimeEnvelope => ({
  routeId: routeKey(route.routeId as BrandAlias<string, 'ControlPlaneRoute'>),
  tenant: route.tenant,
  payload: {
    topic: route.topic,
    routeId: route.routeId,
    tenant: route.tenant,
  },
});

export const describeManifest = (manifest: ControlPlaneManifest): readonly BrandedRoute[] =>
  manifest.timeline.map((entry) => ({
    route: {
      routeId: routeKey(asRoute(`telemetry:${entry.stage}`)),
      topic: `control-plane.stage.${entry.stage}`,
      tenant: manifest.tenant,
      payload: { stage: entry.stage, event: entry.event },
    },
    stage: entry.stage,
  }));

export const routeSignature = (route: ControlPlaneRoute): string => `${route.topic}/${route.routeId}`;

export const aggregateConstraints = (items: readonly ControlPlaneConstraint[]): ConstraintSnapshot[] => {
  const now = new Date().toISOString();
  return items.map((item) => ({
    name: item.name,
    kind: item.kind,
    limit: item.limit,
    warningThreshold: item.warningThreshold,
    checked: true,
    checkedAt: now,
  }));
};

export const buildEnvelopeCatalog = (routes: readonly ControlPlaneRoute[]): readonly RuntimeEnvelope[] =>
  routes.map((route) => ({
    routeId: routeKey(asRoute(`router:${route.topic}`)),
    tenant: route.tenant,
    payload: {
      topic: route.topic,
      routeId: route.routeId,
      tenant: route.tenant,
      routePresent: true,
    },
  }));

export const pair = <A>(a: A): [A] => [a];

export const pairify = <A, B>(a: A, b: B): [A, B] => [a, b];

export const unzip = <A, B>(rows: readonly [A, B][]): { readonly left: readonly A[]; readonly right: readonly B[] } => {
  const left: A[] = [];
  const right: B[] = [];
  for (const item of rows) {
    left.push(item[0]);
    right.push(item[1]);
  }
  return { left: [...left], right: [...right] };
};

export const tupleToObject = <T extends readonly string[]>(items: T): Record<T[number], number> => {
  const out: Partial<Record<T[number], number>> = {};
  for (const item of items) {
    out[item as T[number]] = item.length;
  }
  return out as Record<T[number], number>;
};

export const resolveMetadata = <T>(metadata: T): T & {
  readonly resolvedAt: string;
  readonly hasConstraints: boolean;
} => ({
  ...metadata,
  resolvedAt: new Date().toISOString(),
  hasConstraints: true,
} as T & { readonly resolvedAt: string; readonly hasConstraints: boolean });
