export type SnakeCase = `${string & {}}_${string & {}}`;
export type KebabCase = `${string & {}}-${string & {}}`;
export type NamespaceToken = string & { readonly __brand: 'NamespaceToken' };

export type PrefixUnion<
  TParts extends readonly string[],
  TPrefix extends string,
> = TParts[number] extends infer P
  ? P extends string
    ? `${TPrefix}-${P}`
    : never
  : never;

export type StripPrefix<T> = T extends `${infer _Prefix}-${infer Rest}` ? Rest : T;

export type WrapTemplate<T, P extends string> = T extends string
  ? `${P}::${T}`
  : T extends number
    ? `${P}::${`${T}`}`
    : T extends boolean
      ? `${P}::${T extends true ? 'true' : 'false'}`
      : T extends Date
        ? `${P}::date`
        : `${P}::object`;

export type TransformedValue<V> = V extends string
  ? { readonly kind: 'text'; readonly value: V; readonly length: V['length'] }
  : V extends number
    ? { readonly kind: 'number'; readonly value: V; readonly decimals: `${V}` extends `${infer _}.${infer _}` ? true : false }
    : V extends boolean
      ? { readonly kind: 'boolean'; readonly value: V }
      : V extends readonly [infer H, ...infer T]
        ? { readonly kind: 'tuple'; readonly head: TransformedValue<H>; readonly tail: TransformedValue<T> }
        : V extends readonly (infer U)[]
          ? { readonly kind: 'array'; readonly item: TransformedValue<U>; readonly length: V['length'] }
          : V extends object
            ? { readonly kind: 'object'; readonly fields: NestedTransform<V> }
            : { readonly kind: 'unknown'; readonly value: V };

export type NestedTransform<T> = T extends object
  ? { [K in keyof T as K & string]: TransformedValue<T[K]> }
  : {};

export type PreserveModifiers<T> = {
  [K in keyof T]:
    T[K] extends object ? PreserveModifiers<T[K]> : T[K];
};

export type TransformRouteMap<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}:${K}` : never]: T[K] extends Record<string, unknown>
    ? NestedTransform<T[K]>
    : TransformedValue<T[K]>;
};

export type MatrixKeyRemap<
  TRecord extends Record<string, Record<string, unknown>>,
  TPfx extends string,
> = {
  [K in keyof TRecord as `${TPfx}/${K & string}`]: {
    readonly namespace: NamespaceToken;
    readonly payload: TransformRouteMap<TRecord[K], `${TPfx}-${K & string}`>;
  };
};

export type DeepMapRemap<
  TRecord extends Record<string, Record<string, unknown>>,
  TDomain extends string,
> = {
  [K in keyof TRecord as K extends string ? `${TDomain}.${K}` : never]:
    TRecord[K] extends infer Payload
      ? Payload extends Record<string, unknown>
        ? {
            readonly domain: TDomain;
            readonly route: MatrixKeyRemap<Record<K & string, Payload & Record<string, unknown>>, K & string>;
            readonly trace: `${TDomain}.${K & string}.v1`;
          }
        : never
      : never;
};

export type MergeTemplateMaps<
  T extends Record<string, Record<string, unknown>>,
  Domain extends string = 'stress',
> = PreserveModifiers<DeepMapRemap<T, Domain>> & PreserveModifiers<TransformRouteMap<T, `global-${Domain}`>>;

type RouteUnion<
  TMap extends Record<string, unknown>,
  TPrefix extends string = 'route',
> = {
  [K in keyof TMap as K & string]:
    TMap[K] extends Record<string, unknown>
      ? {
          [I in keyof TMap[K] as I & string]:
            I extends string ? `${TPrefix}/${K & string}/${I}` : never
        }[keyof TMap[K] & string]
      : never;
}[keyof TMap & string];

export type RouteUnionFromInput<TMap extends Record<string, Record<string, unknown>>, Prefix extends string = 'route'> =
  RouteUnion<TMap, Prefix>;

export type EventMatrix<
  TMap extends Record<string, Record<string, unknown>>,
  TPfx extends string = 'event',
> = {
  [K in RouteUnionFromInput<TMap, TPfx>]:
    K extends `${infer _Domain}/${infer Kind}/${infer Event}`
      ? {
          readonly domain: _Domain;
          readonly kind: Kind;
          readonly event: Event;
          readonly key: WrapTemplate<K, 'event'>;
        }
      : never;
};

export type EventEnvelope<T extends Record<string, Record<string, unknown>>> = {
  readonly version: 1;
  readonly stamp: number;
  readonly routes: RouteUnionFromInput<T>;
  readonly map: MergeTemplateMaps<T>;
};

export const mapByTemplate = <TRecord extends Record<string, Record<string, unknown>>>(
  source: TRecord,
): MergeTemplateMaps<TRecord> => {
  const entries = Object.entries(source).flatMap(([kind, payload]) =>
    Object.entries(payload).map(([event, body]) => [`${kind}:${event}`, body] as const),
  );
  const result: Record<string, unknown> = {};
  for (const [route, body] of entries) {
    result[route] = {
      namespace: `${route}` as NamespaceToken,
      payload: {
        ...(body as Record<string, unknown>),
      },
    };
  }
  return result as MergeTemplateMaps<TRecord>;
};

export const mapToMatrix = <TMap extends Record<string, Record<string, unknown>>>(
  input: TMap,
): MatrixKeyRemap<TMap, 'stress'> => {
  return Object.fromEntries(
    Object.entries(input).map(([kind, payload]) => [
      `stress/${kind}`,
      {
        namespace: `${kind}` as NamespaceToken,
        payload: Object.fromEntries(
          Object.entries(payload).map(([name]) => [`stress:${name}`, `${kind}:${name}`]),
        ) as Record<string, unknown>,
      },
    ]),
  ) as MatrixKeyRemap<TMap, 'stress'>;
};

export const routeCatalogFromTuple = <
  TMap extends Record<string, Record<string, unknown>>,
  TDomain extends string,
>(
  domain: TDomain,
  payload: TMap,
): EventMatrix<TMap, 'route'> => {
  const rows = Object.entries(payload).map(([kind, events]) => {
    const nested = Object.keys(events).map((event) => ({
      domain,
      kind,
      event,
      key: `event/${kind}/${event}`,
      }));
    return nested;
  });
  const catalog = {
    version: 1,
    stamp: Date.now(),
    routes: rows.flat().map((entry) => `route/${entry.kind}/${entry.event}`),
    map: {
      [domain]: mapByTemplate(payload),
    },
  };
  return catalog as unknown as EventMatrix<TMap, 'route'>;
};

export const flattenTemplateKeys = <T extends object>(value: T): readonly (readonly [string, unknown])[] => {
  return Object.entries(value).flatMap(([key, child]) => {
    if (child === null || child === undefined) {
      return [[key, child]];
    }
    if (typeof child === 'object') {
      return Object.entries(child as object).map(([inner, innerValue]) => [`${key}.${inner}`, innerValue]);
    }
    return [[key, child]];
  }) as readonly (readonly [string, unknown])[];
};
