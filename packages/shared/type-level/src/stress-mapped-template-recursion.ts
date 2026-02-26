export type KeyProjection<T> = T extends string ? `k:${T}` : never;
export type TemplatePrefix<T extends string> = `${T}::`;

export type CamelToKebab<T extends string> = T extends `${infer Head}${infer Tail}`
  ? Head extends Uppercase<Head>
    ? Head extends Lowercase<Head>
      ? `${Lowercase<Head>}${CamelToKebab<Tail>}`
      : `-${Lowercase<Head>}${CamelToKebab<Tail>}`
    : `${Head}${CamelToKebab<Tail>}`
  : '';

export type KebabToSnake<T extends string> = T extends `${infer Head}-${infer Tail}`
  ? `${Lowercase<Head>}_${KebabToSnake<Tail>}`
  : Lowercase<T>;

export type Pathify<T extends string> = T extends `${infer A}/${infer B}/${infer C}`
  ? `/${KebabToSnake<A>}/${KebabToSnake<B>}/${KebabToSnake<C>}`
  : `/${KebabToSnake<T>}`;

export type RemapTemplateKeys<T> = {
  [K in keyof T & string as `${TemplatePrefix<K>}${KebabToSnake<K>}`]: T[K];
};

export type DeepTemplateMap<T> =
  T extends readonly unknown[]
    ? { [K in keyof T]: DeepTemplateMap<T[K]> }
    : T extends Record<string, unknown>
      ? {
          [K in keyof T & string as `x:${KebabToSnake<K>}`]:
            T[K] extends Record<string, unknown> | readonly unknown[]
              ? DeepTemplateMap<T[K]>
              : { readonly value: T[K] };
        }
      : { readonly value: T };

export type ResolveTemplate<T> = T extends { [Key in keyof T]: infer V } ? { [K in keyof T]: ResolveTemplate<V> } : T extends `${infer A}/${infer B}/${infer C}`
  ? { readonly namespace: A; readonly action: B; readonly id: C; readonly route: `${A}/${B}/${C}` }
  : T;

export type EventEnvelope<T> = { readonly raw: string; readonly parsed: T };

export type TemplateEvent<K extends string, V> = { readonly key: K; readonly value: V; readonly path: Pathify<K> };

export type EventUnion<T extends Record<string, unknown>> = {
  [K in keyof T & string]: TemplateEvent<K, T[K]>;
}[keyof T & string];

export type EventCatalog<T extends Record<string, unknown>> = {
  [K in keyof T & string as KebabToSnake<K>]: EventUnion<{ [P in K]: T[P] }>;
};

export type DeepEventCatalog<T extends Record<string, unknown>> = {
  [K in keyof T & string as `evt-${KebabToSnake<K>}`]:
    T[K] extends Record<string, unknown>
      ? { [P in keyof T[K] & string as `evt-${KebabToSnake<P>}`]: EventCatalog<{ [Q in P]: T[K][P] }> }
      : EventUnion<{ [Q in K]: T[K] }>;
};

export type Branded<T, B extends string> = T & { readonly __brand: B };
export type NoInfer<T> = [T][T extends any ? 0 : never];
export type NormalizedName<T extends string> = Branded<KebabToSnake<T>, 'NormalizedName'>;

export type TemplateRoute<T extends string> = T extends `${infer A}-${infer B}-${infer C}`
  ? { readonly head: NormalizedName<A>; readonly tail: NormalizedName<B>; readonly tailIndex: NormalizedName<C>; readonly composite: `/${A}/${B}/${C}` }
  : Branded<T, 'TemplateRoute'>;

export type EventEnvelopeMap<T extends Record<string, unknown>> = {
  [K in keyof T & string]: EventEnvelope<TemplateRoute<K>>;
};

export type FlattenTemplateEvent<T extends Record<string, unknown>> = T extends readonly unknown[]
  ? readonly { [K in keyof T]: TemplateEvent<string & K, T[K]> }[]
  : EventUnion<T>;

const toSnakeRuntime = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();

export const templateCatalog = {
  entity: {
    IncidentOpen: { route: 'incident-opened', stage: 'discover' },
    RecoveryRequest: { route: 'recovery-request', stage: 'assess' },
    RuntimeAudit: { route: 'runtime-audit', stage: 'notify' },
  },
  control: {
    EmergencyHalt: { route: 'emergency-halt', stage: 'drain' },
    RetrySignal: { route: 'retry-signal', stage: 'reconcile' },
    QueueSync: { route: 'queue-sync', stage: 'sync' },
  },
  telemetry: {
    MetricBurst: { route: 'metric-burst', stage: 'observe' },
    EventSkew: { route: 'event-skew', stage: 'observe' },
    ThroughputDrop: { route: 'throughput-drop', stage: 'verify' },
  },
} as const;

export const transformedCatalog = Object.fromEntries(
  Object.entries(templateCatalog).map(([group, values]) => {
    const transformedGroup = Object.fromEntries(
      Object.entries(values).map(([name, payload]) => [`x:${toSnakeRuntime(name)}`, { value: payload.route }]),
    );
    return [`x:${toSnakeRuntime(group)}`, transformedGroup];
  }),
) as unknown as DeepTemplateMap<typeof templateCatalog>;

export const templateRoutes = [
  { raw: 'incident-opened/critical/t-1', key: 'IncidentOpen:open' },
  { raw: 'recovery-request/high/t-2', key: 'RecoveryRequest:assess' },
  { raw: 'runtime-audit/medium/t-3', key: 'RuntimeAudit:audit' },
  { raw: 'emergency-halt/critical/t-4', key: 'EmergencyHalt:halt' },
  { raw: 'retry-signal/low/t-5', key: 'RetrySignal:retry' },
  { raw: 'queue-sync/medium/t-6', key: 'QueueSync:sync' },
  { raw: 'metric-burst/high/t-7', key: 'MetricBurst:observe' },
  { raw: 'event-skew/low/t-8', key: 'EventSkew:observe' },
  { raw: 'throughput-drop/high/t-9', key: 'ThroughputDrop:verify' },
] as const;

export type RouteMapShape = {
  [K in (typeof templateRoutes)[number]['key']]: {
    namespace: string;
    action: string;
    id: string;
    route: string;
  };
};

export const routeMap: RouteMapShape = Object.fromEntries(
  templateRoutes.map((current) => {
    const [namespace, action, id] = current.raw.split('/');
    return [
      current.key,
      { namespace: namespace ?? 'unknown', action: action ?? 'unknown', id: id ?? 'unknown', route: current.raw },
    ];
  }),
) as RouteMapShape;

export const routeKeys = Object.keys(routeMap) as (keyof RouteMapShape)[];
export type RouteKeyUnion = (typeof routeKeys)[number];
export type RouteEnvelopeUnion = EventEnvelope<TemplateRoute<string>>;

export const compileTemplateCatalog = <T extends Record<string, unknown>>(input: T): DeepTemplateMap<T> =>
  input as unknown as DeepTemplateMap<T>;

export const templateEnvelope = (route: string): EventEnvelope<TemplateRoute<string>> => ({
  raw: route,
  parsed: route as TemplateRoute<string>,
});

export const templateSignatureCatalog = templateRoutes.reduce(
  (acc, entry) => ({
    ...acc,
    [entry.key]: templateEnvelope(entry.raw),
  }),
  {} as Record<RouteKeyUnion, RouteEnvelopeUnion>,
);

export const resolveTemplateRoute = (route: string): TemplateRoute<string> => {
  const [head, tail = 'route', tailIndex = '0'] = route.split('-');
    if (route.includes('-')) {
      return {
        head: head.toLowerCase() as Branded<string, 'NormalizedName'>,
        tail: tail.toLowerCase() as Branded<string, 'NormalizedName'>,
        tailIndex: tailIndex.toLowerCase() as Branded<string, 'NormalizedName'>,
        composite: `/${head.toLowerCase()}/${tail.toLowerCase()}/${tailIndex.toLowerCase()}`,
      } as unknown as TemplateRoute<string>;
    }

  return route.toLowerCase() as unknown as TemplateRoute<string>;
};
export const resolveTemplateMap = compileTemplateCatalog(routeMap) as DeepTemplateMap<RouteMapShape>;

export const templateTypeFold = <T extends readonly string[]>(values: T) => {
  return values.map((value) => value.replace(/-/g, '_')) as { readonly [K in keyof T]: NoInfer<T[K]> };
};
