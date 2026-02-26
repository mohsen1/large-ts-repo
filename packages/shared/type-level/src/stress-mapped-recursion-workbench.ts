import type { NoInfer } from './patterns';
import type { NoInferAdvanced as StrictInfer } from './composition-labs';

export type PrimitiveShape = string | number | boolean | null | undefined;

type NestedTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [NestedMap<Head>, ...NestedTuple<Rest extends readonly unknown[] ? Rest : []>]
  : readonly [];

export type DeepValueTemplate<T> = T extends `${infer Prefix}:${infer Suffix}`
  ? {
      readonly root: Prefix;
      readonly leaf: Suffix;
    }
  : {
      readonly root: T;
    };

type UpperSnake<T extends string> = T extends `${infer Head}_${infer Tail}`
  ? `${Uppercase<Head>}_${UpperSnake<Tail>}`
  : Uppercase<T>;

type KebabToSnake<T extends string> = T extends `${infer Left}-${infer Right}`
  ? `${Left & string}_${KebabToSnake<Right>}`
  : T;

type CamelSegment<K extends string> = K extends `${infer Head}-${infer Tail}`
  ? `${Lowercase<Head>}${Capitalize<CamelSegment<Tail>>}`
  : K;

export type TemplateRemap<T> = {
  [K in keyof T & string as `cfg-${KebabToSnake<K>}`]: T[K] extends object
    ? { [Q in keyof T[K] & string as `${K}-${Q}`]: DeepValueTemplate<Q & string> }
    : T[K] & string;
};

export type NestedMap<T> = T extends PrimitiveShape
  ? T
  : T extends readonly unknown[]
    ? NestedTuple<T>
    : T extends object
      ? {
          [K in keyof T & string as `${K}_${UpperSnake<K>}`]: NestedMap<T[K]>;
        }
      : never;

export type MapLike<T extends Record<string, unknown>> = {
  readonly [K in keyof T as K extends string ? `domain.${K}` : never]: T[K];
};

export type DeepRename<T> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [DeepRename<Head>, ...NestedTuple<Rest extends readonly unknown[] ? Rest : []>]
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepRename<U>>
    : T extends object
      ? {
          [K in keyof T & string as `${K}_${UpperSnake<K>}`]: T[K] extends object ? DeepRename<T[K]> : T[K];
        }
      : T;

export type DeepTemplate<K> = K extends `${infer A}::${infer B}`
  ? { readonly head: A; readonly tail: B }
  : { readonly leaf: K };

export type DeepUnionTemplate<T> = T extends `${infer A}::${infer B}`
  ? DeepUnionTemplate<B> | { readonly head: A }
  : never;

export type RouteTemplateUnion<T extends string> = T extends `${infer Left}/${infer Right}`
  ? RouteTemplateUnion<Right> | { readonly segment: Left }
  : { readonly segment: T };

export type TransformKeys<
  T extends Record<string, unknown>,
  Prefix extends string = 'root',
> = {
  [K in keyof T & string as K extends `${infer Head}` ? `${Prefix}::${Head}` : never]:
    T[K] extends Record<string, unknown>
      ? TransformKeys<T[K], `${Prefix}::${K}`>
      : {
          readonly key: K;
          readonly typed: DeepTemplate<`${Prefix}::${K}`>;
          readonly resolved: NoInfer<T[K]>;
        };
};

export interface BaseEvent<TRoute extends string> {
  readonly id: string;
  readonly route: TRoute;
  readonly kind: 'base' | 'layered';
  readonly createdAt: number;
}

export interface LayeredEvent<
  TRoute extends string,
  TContext extends Record<string, string>,
> extends BaseEvent<TRoute> {
  readonly kind: 'layered';
  readonly context: TContext;
  readonly headers: Map<string, string>;
}

export type EventMap = {
  discovery: { domain: 'discover'; action: string; route: '/discover/ingest/v1'; payload: { source: string; mode: 'scan' | 'webhook' } };
  reconcile: { domain: 'reconcile'; action: string; route: '/reconcile/repair/v1'; payload: { target: string; reason: string[] } };
  synthesize: { domain: 'synthesize'; action: string; route: '/synthesize/plan/v1'; payload: { graph: string; constraints: string[] } };
};

export type EventShape = EventMap[keyof EventMap];
export type EventByDomain<T extends keyof EventMap> = EventMap[T];

export type EventContextByRoute<T extends EventShape> = TransformKeys<T['payload']>;
export type EventRouteTemplate<T extends EventShape> = `/${T['domain']}/${T['action']}`;
export type EventRouteCatalog = EventTemplateCatalog<EventMap>;

export type EventTemplateCatalog<T extends Record<string, EventShape>> = {
  [K in keyof T & string]: EventRouteTemplate<T[K]>;
};

export type EventPayloadProjection<T extends Record<string, unknown>> = {
  [K in keyof T & string as `payload_${KebabToSnake<K>}`]:
    T[K] extends string
      ? `{${UpperSnake<T[K]>}}`
      : T[K] extends number
        ? number
  : T[K] extends boolean
          ? boolean
          : T[K] extends readonly unknown[]
            ? ReadonlyArray<NoInfer<T[K] extends readonly (infer U)[] ? U : never>>
            : T[K] extends object
              ? EventPayloadProjection<T[K] & Record<string, unknown>>
              : 'mixed';
};

export type EventDescriptor<T extends EventShape> = Readonly<{
  [K in keyof T]: K extends 'payload'
    ? EventPayloadProjection<T[K] & Record<string, unknown>>
    : T[K]
}>;

export const eventShapeCatalog = {
  discovery: {
    kind: 'discovery',
    route: '/discovery/ingest/v1' as const,
    payload: { source: 'watcher', mode: 'scan' },
  },
  reconcile: {
    kind: 'reconcile',
    route: '/reconcile/repair/v1' as const,
    payload: { target: 'node', reason: ['drift', 'timeout'] },
  },
  synthesize: {
    kind: 'synthesize',
    route: '/synthesize/plan/v1' as const,
    payload: { graph: 'mesh', constraints: ['policy', 'capacity'] },
  },
} as const satisfies Record<
  keyof EventMap,
  {
    kind: string;
    route: `/${string}`;
    payload: Record<string, unknown>;
  }
>;

export type EventCatalogTemplate = typeof eventShapeCatalog;
export type EventCatalogRouteKeys = keyof EventCatalogTemplate;
export type EventCatalogRoutes = EventCatalogTemplate[EventCatalogRouteKeys]['route'];

export const mapEventShape = <T extends EventShape>(event: T): EventDescriptor<T> => {
  return event as EventDescriptor<T>;
};

export const expandEventProjection = <T extends EventShape>(event: T): EventContextByRoute<T> => {
  const route = event.payload as unknown as Record<string, unknown>;
  return route as EventContextByRoute<T>;
};

export const typedLookup = <
  T extends Record<string, { payload: Record<string, unknown> }>,
  K extends keyof T,
>(catalog: T, key: K, token: StrictInfer<K>) => {
  return catalog[key]?.payload as unknown as T[K]['payload'];
};
