export type TemplateEnvelope = {
  readonly domain: string;
  readonly action: string;
  readonly scope: string;
  readonly version: number;
};

export type TemplateExpression<K extends string> = K extends `/${infer A}/${infer B}`
  ? `${A}-${B}`
  : never;

export type RouteCell<K extends PropertyKey> = K extends string
  ? `${K}_route`
  : K extends number
    ? `idx_${K}`
    : never;

export type PrefixWithDomain<
  TDomain extends string,
  TKey extends PropertyKey,
> = TKey extends string
  ? `${TDomain}::${Uppercase<TemplateExpression<TDomain & string>>}::${RouteCell<TKey>}`
  : never;

export type DeepRouteMap<TRecord extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof TRecord as PrefixWithDomain<TPrefix, K & PropertyKey>]: TRecord[K];
};

export type RoutedValueTransform<T> =
  T extends string
    ? `route:${T}`
    : T extends number
      ? `n:${T}`
      : T extends boolean
        ? (T extends true ? 'on' : 'off')
        : T extends readonly string[]
          ? T[number] extends infer U
            ? U extends string
              ? `set:${U}`
              : never
            : never
          : T extends Record<string, unknown>
            ? { [K in keyof T]: `mapped:${K & string}` }
            : never;

export type TemplateMapValue<TRecord extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof TRecord as PrefixWithDomain<TPrefix, K & PropertyKey>]: RoutedValueTransform<TRecord[K]>;
};

export type TemplateNestedMap<
  TRecord extends Record<string, Record<string, unknown>>,
  TPrefix extends string,
> = {
  [Domain in keyof TRecord & string]: {
    [Section in keyof TRecord[Domain] & string as `${TPrefix}__${Domain}__${Section}`]: {
      readonly path: `${TPrefix}/${Domain}/${Section}`;
      readonly kind: 'leaf';
    };
  };
};

export type RemappedShape<
  TRecord extends Record<string, Record<string, unknown>>,
  TPrefix extends string,
> = {
  [K in keyof TRecord]: DeepRouteMap<TRecord[K], `${TPrefix}.${K & string}`> & TemplateMapValue<TRecord[K], `${TPrefix}.${K & string}`>;
};

export type MergeMaps<T extends readonly [Record<string, unknown>, ...Record<string, unknown>[]]> = T extends readonly [infer Head, ...infer Tail]
  ? Head & (Tail extends readonly [Record<string, unknown>, ...Record<string, unknown>[]] ? MergeMaps<Tail> : never)
  : {};

export type EnvelopeUnion<T extends Record<string, TemplateEnvelope>> = {
  [K in keyof T]: TemplateEnvelope & T[K] & { readonly key: K & string };
}[keyof T];

export interface RouteDomainInput {
  readonly namespace: string;
  readonly routes: Record<string, string>;
  readonly metadata: {
    readonly owner: string;
    readonly checksum: number;
  };
}

export interface RouteSectionInput {
  readonly section: string;
  readonly envelope: TemplateEnvelope;
  readonly enabled: boolean;
}

export interface RouteBundleInput {
  readonly domains: readonly RouteDomainInput[];
  readonly sections: readonly RouteSectionInput[];
}

export type RouteCatalogFromInput<TBundle extends RouteBundleInput> = {
  [K in keyof TBundle['domains'] & `${number}`]: TBundle['domains'][K] extends infer Domain extends RouteDomainInput
    ? RemappedShape<{ [Name in Domain['namespace']]: Domain['routes'] }, 'bundle'>
    : never;
};

export const buildTemplateProjection = <TBundle extends RouteBundleInput>(bundle: TBundle) => {
  const projection: Record<string, TemplateEnvelope> = {};
  for (const domain of bundle.domains) {
    for (const [name, route] of Object.entries(domain.routes)) {
      const key = `${domain.namespace}::${name}` as keyof typeof projection & string;
      (projection as Record<string, TemplateEnvelope>)[key] = {
        domain: domain.namespace,
        action: name,
        scope: domain.metadata.owner,
        version: domain.metadata.checksum,
      };
    }
  }

  return projection as unknown as RouteCatalogFromInput<TBundle>;
};

export const routeRemapToStringLiterals = <
  TRecord extends Record<string, unknown>,
  TPrefix extends string,
>(input: TRecord, prefix: TPrefix): TemplateMapValue<TRecord, TPrefix> => {
  const entries = Object.entries(input) as [string, unknown][];
  const out = {} as Record<string, string | { [key: string]: string }>; 
  for (const [key, value] of entries) {
    const mapped = `${String(prefix)}_${key}`;
    if (typeof value === 'string') {
      out[mapped] = `route:${value}`;
    } else if (typeof value === 'number') {
      out[mapped] = `n:${value}`;
    } else if (typeof value === 'boolean') {
      out[mapped] = value ? 'on' : 'off';
    } else {
      out[mapped] = { mapped: key };
    }
  }

  return out as TemplateMapValue<TRecord, TPrefix>;
};

export const makeTemplateEnvelope = (template: TemplateEnvelope) => template;
