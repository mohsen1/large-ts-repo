export type Preserve<T> = T extends (...args: any[]) => any
  ? T
  : { readonly [K in keyof T]: T[K] };

export type ToPascal<Part extends string> = Part extends `${infer Head}_${infer Tail}`
  ? `${Capitalize<Lowercase<Head>>}${Capitalize<ToPascal<Tail>>}`
  : Capitalize<Lowercase<Part>>;

export type BrandedByTag<T, Tag extends string> = T & { readonly __brandTag: Tag };

export type TemplateKey<Prefix extends string, K extends string> = `${Prefix}/${K}`;
export type EventKey<Prefix extends string, K extends string> = `${Prefix}:${K}_event`;
export type RouteToken<Domain extends string, Action extends string> = `${Domain}::${Action}`;

export interface TemplateSeed {
  readonly id: string;
  readonly domain: string;
  readonly action: string;
  readonly enabled: boolean;
}

export interface TemplateEnvelope<T extends string = string> {
  readonly template: T;
  readonly createdAt: number;
}

export type PrimitiveValue = string | number | boolean | null | undefined | bigint | symbol;

export type MappedValueTransform<T> = T extends PrimitiveValue
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<MappedValueTransform<U>>
    : T extends Record<string, unknown>
      ? { readonly [K in keyof T as `mapped_${string & K}`]: MappedValueTransform<T[K]> }
      : T;

export type EventMap<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? TemplateKey<Prefix, K> : never]: T[K];
};

export type ReverseEventMap<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? EventKey<Prefix, K> : never]: K extends string
    ? TemplateSeed & { readonly name: K }
    : never;
};

export type TemplateUnion<T extends Record<string, unknown>> =
  keyof T extends infer K
    ? K extends string
      ? K
      : never
    : never;

export type BrandedTemplateUnion<T extends Record<string, unknown>, Prefix extends string> =
  | (TemplateUnion<T> extends infer K ? K extends string ? BrandedByTag<K, Prefix> : never : never)
  | (TemplateUnion<T> extends infer K ? K extends string ? `${Prefix}/${K}` : never : never);

export type NestedTemplateMap<T> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends Record<string, unknown>
    ? Tail extends readonly unknown[]
      ? Readonly<{
          [K in keyof Head & string as `${K}/${TemplateUnion<Head> & string}`]: MappedValueTransform<Head[K]>;
        }> &
        NestedTemplateMap<Tail>
      : never
    : never
  : {};

export type MappedTemplateProduct<T extends Record<string, TemplateSeed>> = {
  [K in keyof T as `payload/${K & string}/v1`]: T[K] extends { id: infer Id; domain: infer Domain; action: infer Action }
    ? RouteToken<Domain & string, Action & string> & {
        readonly ref: Id & string;
      }
    : never;
};

export type TemplateTransform<T extends Record<string, unknown>, Domain extends string> =
  T extends infer RecordType
    ? Readonly<RecordType> &
      {
        readonly domain: Domain;
        readonly routeMap: EventMap<RecordType & Record<string, unknown>, Domain>;
        readonly eventMap: ReverseEventMap<RecordType & Record<string, unknown>, Domain>;
      }
    : never;

export type DeepTemplateMap<T extends Record<string, unknown>> = T extends object
  ? T extends readonly unknown[]
    ? { readonly [I in keyof T]: DeepTemplateMap<T[I] & Record<string, unknown>> }
    : {
        readonly [K in keyof T & string as TemplateKey<'payload', K>]: T[K] extends infer V
          ? V extends Record<string, unknown>
            ? DeepTemplateMap<V>
            : V
          : never;
      }
  : T;

export type RouteEnvelope<Prefix extends string, T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `${Prefix}:${K}` : never]: T[K] extends infer R
    ? R extends string
      ? BrandedByTag<R, 'route'>
      : R extends number
        ? BrandedByTag<R, 'quota'>
        : R extends boolean
          ? BrandedByTag<R, 'gate'>
          : R
    : never;
};

export const templateCatalog: ReadonlyArray<TemplateEnvelope<string>> = [
  { template: '/domain/{id}/command/{command}', createdAt: 1001 },
  { template: '/domain/{id}/timeline/{window}', createdAt: 1002 },
  { template: '/domain/{id}/playbook/{name}', createdAt: 1003 },
  { template: '/domain/{id}/simulation/{run}', createdAt: 1004 },
  { template: '/domain/{id}/incident/{incidentId}', createdAt: 1005 },
] as const;

export const templateIndex = templateCatalog.reduce<Record<string, TemplateEnvelope<string>>>((acc, entry) => {
  acc[entry.template] = entry;
  return acc;
}, {});

export const routeTransforms = templateCatalog.map((entry) => `${entry.template}::${entry.createdAt}`);

export type InferredRoute<T extends string> =
  T extends `${string}/${infer Id}/${infer Domain}/${infer Tail}`
    ? { readonly id: Id; readonly domain: Domain; readonly tail: Tail; readonly source: T }
    : { readonly source: T };

export type RouteProjection<T extends string> =
  InferredRoute<T> extends { readonly id: infer Id; readonly domain: infer Domain; readonly tail: infer Tail }
    ? {
        readonly id: Id;
        readonly domain: Domain;
        readonly tail: Tail;
        readonly path: T;
      }
    : { readonly path: T };

export type KeyedEnvelope<T extends Record<string, unknown>> = {
  [K in keyof T & string as `payload-${K}`]: {
    readonly name: K;
    readonly value: T[K];
    readonly boxed: MappedValueTransform<T[K]>;
  };
};

export type ExpandTemplateRecords<T extends Record<string, unknown>> = {
  [A in keyof T & string]: {
    readonly [K in keyof T[A] & string as `cfg/${A}/${K}`]: RouteProjection<`${A}/${K}`>;
  };
};

export const templateMapRegistry: {
  readonly core: RouteProjection<string>;
  readonly audit: RouteProjection<string>;
  readonly recovery: RouteProjection<string>;
} = {
  core: { path: 'core' },
  audit: { path: 'audit' },
  recovery: { path: 'recovery' },
};
