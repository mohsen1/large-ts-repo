export type SignalVerb = 'create' | 'update' | 'delete' | 'snapshot' | 'drain' | 'throttle' | 'route' | 'notify' | 'rollback' | 'replay';
export type SignalRegion = 'fabric' | 'incident' | 'policy' | 'timeline' | 'atlas' | 'mesh' | 'workload' | 'ops';
export type SignalScope = 'tenant' | 'session' | 'workspace' | 'domain';

export interface PrimitiveSignalTemplate<TScope extends SignalScope = SignalScope> {
  readonly scope: TScope;
  readonly token: `${string}:${string}`;
  readonly score: number;
}

export interface SignalEnvelope<T extends SignalRegion = SignalRegion> extends PrimitiveSignalTemplate {
  readonly region: T;
  readonly namespace: `${T}::${SignalVerb}`;
  readonly ttl: bigint;
}

export type SignalCatalogInput = Record<string, Record<string, PrimitiveSignalTemplate>>;

export type TemplateRemap<T extends SignalCatalogInput> = {
  readonly [K in keyof T as `signal:${string & K}`]: {
    readonly [N in keyof T[K] as `meta:${string & N}`]: T[K][N];
  };
};

export type NestedTemplateRemap<T extends SignalCatalogInput> = {
  readonly [K in keyof T as `bundle:${string & K}`]: {
    readonly [N in keyof T[K] as `entry:${string & N}`]: T[K][N];
  };
};

export type MappedTemplateRecord<T extends SignalCatalogInput> = {
  readonly entries: NestedTemplateRemap<T>;
  readonly flattened: readonly PrimitiveSignalTemplate[];
};

export type EventRoute = `/${SignalRegion}/${SignalVerb}/${SignalScope}`;

export type EventRouteCatalog<T extends readonly EventRoute[]> = {
  [K in keyof T as T[K] & string extends infer Key
    ? `prefix:${string & Key}`
    : never]: {
    readonly original: T[K];
    readonly id: `evt-${Extract<K, number>}`;
  };
};

export type TemplateRouteKey<T extends string, P extends string, S extends string> = `${T}:${P}:${S}:${string}`;

export type RouteProjection<T extends readonly EventRoute[]> = {
  [K in T[number] as `entry:${K}`]: { readonly original: K; readonly id: `evt-${Extract<number, keyof T>}` };
};

export const signalCatalog = {
  incident: {
    alpha: {
      scope: 'tenant',
      score: 0.92,
      token: 'incident:create',
    },
    beta: {
      scope: 'session',
      score: 0.77,
      token: 'fabric:route',
    },
  },
  fabric: {
    gamma: {
      scope: 'workspace',
      score: 0.68,
      token: 'fabric:notify',
    },
    delta: {
      scope: 'domain',
      score: 0.95,
      token: 'fabric:rollback',
    },
  },
} as const satisfies SignalCatalogInput;

export type SignalCatalogShape = typeof signalCatalog;
export type SignalCatalogRemap = ReturnType<typeof withTemplateRemap<typeof signalCatalog>>['entries'];

export const remappedSignalCatalog = {
  incident: {
    alpha: {
      scope: 'tenant',
      score: 0.92,
      token: 'incident:create',
      region: 'incident' as const,
      namespace: 'incident::create' as const,
      ttl: 100n,
    },
  },
} as const;

export const toTemplateToken = <T extends string>(value: T): TemplateRouteKey<'signal', 'route', 'v1'> =>
  `signal:route:v1:${value}` as TemplateRouteKey<'signal', 'route', 'v1'>;

export const withTemplateRemap = <T extends SignalCatalogInput>(input: T): MappedTemplateRecord<T> => {
  const entries = {} as Record<string, Record<string, unknown>>;
  const flattened: PrimitiveSignalTemplate[] = [];
  for (const [outerKey, record] of Object.entries(input) as Array<[string, Record<string, PrimitiveSignalTemplate>]>) {
    const nested = {} as Record<string, unknown>;
    for (const [entryKey, entryValue] of Object.entries(record) as Array<[string, PrimitiveSignalTemplate]>) {
      nested[`entry:${entryKey}`] = entryValue as unknown;
      flattened.push(entryValue);
    }
    entries[`bundle:${outerKey}`] = nested as Record<string, unknown>;
  }
  return {
    entries: entries as NestedTemplateRemap<T>,
    flattened,
  } as MappedTemplateRecord<T>;
};

export const routeTemplates = Object.freeze([
  '/incident/create/tenant',
  '/incident/update/session',
  '/fabric/contain/workspace',
  '/policy/restore/domain',
  '/mesh/rollback/session',
] as const) as readonly EventRoute[];

export const routeProjection = Object.fromEntries(routeTemplates.map((route, index) => [`entry:${route}`, { original: route, id: `evt-${index}` }])) as Record<
  string,
  { readonly original: EventRoute; readonly id: string }
>;

export type RouteProjectionRecord = typeof routeProjection;
