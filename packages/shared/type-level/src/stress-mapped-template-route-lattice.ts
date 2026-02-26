export interface EventTemplateRecord {
  readonly policy: string;
  readonly scope: string;
}

export interface EventRouteProfile {
  readonly scenario: string;
  readonly owner: string;
}

export interface MitigationSignals {
  readonly cause: string;
  readonly impact: number;
}

export interface InspectSignal {
  readonly signal: string;
  readonly priority: number;
}

export interface RecoveryEventMap {
  recover: EventTemplateRecord;
  launch: EventRouteProfile;
  inspect: InspectSignal;
  mitigate: MitigationSignals;
}

export type TemplateTransform<K extends string> = `evt_${K}`;

export type EventMapTemplate<T extends object> = {
  [K in keyof T as K extends string ? TemplateTransform<K> : never]: T[K] extends { [P in keyof T[K]]: unknown }
      ? T[K] & Readonly<Record<`meta_${K & string}`, string>>
    : never;
};

export type PrefixedTemplate<K extends string> = `routed_${Uppercase<K>}`;

export type DeepTemplateRemap<T> = {
  readonly [K in keyof T as K extends string ? PrefixedTemplate<K> : never]: {
    readonly source: K & string;
    readonly value: T[K];
    readonly nested: T[K] extends Record<string, infer V>
      ? {
          readonly [P in keyof T[K] & string as `${K & string}_${P}`]: V;
        }
      : never;
  };
};

export type PreserveModifiers<T> = {
  [K in keyof T as K extends string ? `preserved_${K & string}` : never]: T[K];
};

export type RouteTemplateCatalogShape = {
  readonly entities: {
    auth: string;
    policy: string;
    telemetry: string;
  };
  readonly routes: {
    active: boolean;
    level: 1 | 2 | 3;
  };
};

export type DeepTemplatePathMap<
  T extends object,
  Prefix extends string = 'route',
> = {
  [Domain in keyof T & string]: T[Domain] extends object
    ? {
        [Mode in keyof T[Domain] & string as `${Prefix}__${Domain}__${Mode}`]: {
          readonly kind: `${Domain}-${Mode}`;
          readonly value: T[Domain][Mode];
          readonly stamped: `${Domain}:${Mode}`;
        }
      }
    : Record<string, never>;
};

export type EventRouteSignatureMap<T extends Record<string, unknown>> = {
  readonly [K in keyof T & string as `route_signature_${K}`]: {
    readonly key: K;
  };
};

export type RouteTemplateUnion = EventMapTemplate<RecoveryEventMap> | DeepTemplateRemap<RecoveryEventMap>;

export type MappedEnvelopeBase<T extends object> = DeepTemplateRemap<T> & PreserveModifiers<T>;

export type MappedEnvelope<
  T extends object,
  Extra extends string = 'v2',
> = MappedEnvelopeBase<T> & EventMapTemplate<T>;

export const routeEventSeed: RecoveryEventMap = {
  recover: {
    policy: 'failover',
    scope: 'regional',
  },
  launch: {
    scenario: 'drill',
    owner: 'ops-engine',
  },
  inspect: {
    signal: 'heartbeat',
    priority: 3,
  },
  mitigate: {
    cause: 'latency',
    impact: 87,
  },
} as const;

export type EventMapTemplateKeys = keyof EventMapTemplate<RecoveryEventMap>;

export type DeepTemplateSignature = DeepTemplatePathMap<{
  control: { strict: 'strict'; adaptive: 'adaptive' };
  recovery: { emergency: 'emergency'; graceful: 'graceful' };
}, 'atlas'>;

export const routeSignature = <T extends { [K in keyof T]: object }>(seed: T): {
  mapped: DeepTemplateRemap<T>;
  nested: DeepTemplatePathMap<T, 'routed'>;
  preserved: PreserveModifiers<T>;
  signatures: EventMapTemplate<T>;
  envelope: MappedEnvelopeBase<T> & EventMapTemplate<T>;
} => {
  const seeded = Object.entries(seed) as Array<[string, Record<string, unknown>]>;
  const mapped: DeepTemplateRemap<T> = Object.fromEntries(
    seeded.map(([domain, modes]) => [
      `routed_${domain.toUpperCase()}`,
      {
        source: domain,
        value: modes,
        nested: Object.fromEntries(
          Object.keys(modes).map((mode) => [`${domain}_${mode}`, (modes as Record<string, unknown>)[mode]]),
        ),
      },
    ]),
  ) as DeepTemplateRemap<T>;

  const preserved = Object.fromEntries(
    seeded.map(([key, value]) => [`preserved_${key}`, value]),
  ) as PreserveModifiers<T>;

  const signatures = Object.fromEntries(
    seeded.map(([key, value]) => [
      `evt_${key}`,
      {
        ...(value as Record<string, unknown>),
        [`meta_${key}`]: 'meta',
      },
    ]),
  ) as EventMapTemplate<T>;

  const nested = Object.fromEntries(
    seeded.flatMap(([domain, modes]) =>
      Object.keys(modes).map((mode) => [
        `routed__${domain}__${mode}`,
        { kind: `${domain}-${mode}`, value: (modes as Record<string, unknown>)[mode], stamped: `${domain}:${mode}` },
      ]),
    ),
  ) as unknown as DeepTemplatePathMap<T, 'routed'>;

  return {
    mapped,
    nested,
    preserved,
    signatures,
    envelope: {
      ...(mapped as DeepTemplateRemap<T>),
      ...(preserved as PreserveModifiers<T>),
      ...(signatures as EventMapTemplate<T>),
    },
  };
};

export const routeTemplateCatalog = routeSignature(routeEventSeed);

export type TemplateSignature =
  | ({
      kind: 'mapped';
      payload: typeof routeTemplateCatalog;
    })
  | ({
      kind: 'catalog';
      payload: RouteTemplateUnion;
    });

export const routeTemplateSignatures: readonly TemplateSignature[] = [
  { kind: 'mapped', payload: routeTemplateCatalog },
  {
    kind: 'catalog',
    payload: {
      evt_recover: {
        policy: 'failover',
        scope: 'global',
        meta_recover: 'meta',
      },
      evt_launch: {
        scenario: 'safety',
        owner: 'ops',
        meta_launch: 'meta',
      },
      evt_inspect: {
        signal: 'latency',
        priority: 2,
        meta_inspect: 'meta',
      },
      evt_mitigate: {
        cause: 'cpu',
        impact: 42,
        meta_mitigate: 'meta',
      },
    },
  },
];

export type FlattenRouteTemplate<T> = {
  [K in keyof T & string as `route_${K}`]: T[K] extends { [P in string]: infer V }
    ? {
        key: K;
        value: V;
      }
    : never;
};

export type RouteTemplateAccess<T extends Record<string, unknown>> = {
  readonly source: { [K in keyof T]: K };
  readonly flat: FlattenRouteTemplate<T>;
  readonly signature: EventRouteSignatureMap<T>;
};

export const buildRouteTemplateAccess = <T extends Record<string, unknown>>(value: T): RouteTemplateAccess<T> => {
  return {
    source: Object.entries(value).reduce(
      (acc, [key]) => ({
        ...acc,
        [key]: key,
      }),
      {} as { [K in keyof T]: K },
    ),
    flat: Object.fromEntries(Object.keys(value).map((key) => [`route_${key}`, { key, value: value[key as keyof T] }])),
    signature: Object.fromEntries(Object.keys(value).map((key) => [`route_signature_${key}`, { key }])),
  } as RouteTemplateAccess<T>;
};
