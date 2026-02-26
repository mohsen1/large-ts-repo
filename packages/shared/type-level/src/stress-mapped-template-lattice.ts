export type TrimPath<T extends string> = T extends `_${infer Rest}` ? TrimPath<Rest> : T;

export type ToSnake<T extends string> =
  T extends `${infer Head}${infer Tail}`
    ? Tail extends ''
      ? Lowercase<T>
      : `${Lowercase<Head>}${ToSnake<Tail>}`
    : T;

export type ToTemplateCase<T extends string> = T extends `${infer A}_${infer B}`
  ? `${Capitalize<Lowercase<A>>}/${ToTemplateCase<B>}`
  : T extends `${infer A}`
    ? Capitalize<Lowercase<A>>
    : T;

export type ValueByKind<T> = T extends { kind: infer K; value: infer V } ? { [P in Extract<K, string>]: V } : never;

export type ExpandTemplateUnion<T, P extends string = ''> = T extends [infer H, ...infer R]
  ? H extends string
    ? `${P}${TrimPath<H>}` | ExpandTemplateUnion<R, `${P}${TrimPath<H>}.`>
    : never
  : never;

export type RouteParamMap<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T as K extends string ? `param-${ToTemplateCase<K>}` : never]: {
        in: K;
        readonly value: T[K];
      };
    }
  : never;

export interface MapConfig {
  readonly preserveUnknown: boolean;
  readonly strictRoutes: boolean;
  readonly scope: string;
}

export interface RouteCell {
  readonly id: string;
  readonly kind: 'literal' | 'param' | 'wild';
  readonly pattern: string;
}

export type TemplateTransform<T> = T extends Record<string, unknown>
  ? { [K in keyof T as K extends `_${infer Rest}` ? Rest : `route_${K & string}`]: T[K] }
  : never;

export type StripModifiers<T> = {
  -readonly [K in keyof T]: T[K];
};

export type MapPayloadByTemplate<T extends Record<string, unknown>> = {
  readonly [K in keyof T as `payload:${K & string}`]: T[K];
} & {
  readonly [K in keyof T as `readonly_${K & string}`]+?: T[K];
};

export type EventMap<T extends Record<string, unknown>> = {
  [K in keyof T as `${K & string}/${string & keyof T}`]: {
    readonly from: K;
    readonly to: keyof T;
  };
};

export type TemplateUnion<T extends string> = T extends `${infer A}/${infer B}/${infer C}`
  ? `${A}` | `${A}/${B}` | `${A}/${B}/${C}` | `${A}/${B}/${C}/${string}`
  : never;

export type NestedMapped<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? NestedMapped<T[K]>
    : T[K];
};

export type RemapWithTemplate<T extends Record<string, unknown>> = NestedMapped<{
  [K in keyof T as K extends `__${string}` ? never : `${K & string}-key`]: T[K];
}>;

export type ComposeRoute<T extends Record<string, unknown>> = {
  [K in keyof T as `route_${K & string}`]: {
    readonly kind: K extends string ? K : never;
    readonly template: TemplateUnion<`${K & string}/${Extract<keyof T, string>}`>;
    readonly payload: RouteCell;
  };
};

export type LookupTemplate<T extends Record<string, readonly string[]>, K extends keyof T & string> = T[K][number];

export type RouteBag<T extends Record<string, Record<string, unknown>>> = {
  [K in keyof T as `bag:${K & string}`]: {
    [P in keyof T[K] as `route:${P & string}`]: T[K][P];
  };
};

export const pathTemplates = {
  identity: '/identity/plan/:planId',
  continuity: '/continuity/mesh/:meshId',
  policy: '/policy/activate/:policyId',
} as const satisfies Record<string, string>;

export type TemplateByKind = typeof pathTemplates;
export type RuntimeTemplateMap = RouteTemplateMap<TemplateByKind>;

export type RouteTemplateMap<T extends Record<string, string>> = {
  [K in keyof T]: {
    readonly raw: T[K];
    readonly segments: TemplateUnion<T[K] & string>;
    readonly keys: TemplateToParams<T[K] & string>;
  };
};

type TemplateToParams<T extends string> = T extends `${string}:${infer P}/${infer Rest}`
  ? P | TemplateToParams<Rest>
  : T extends `${string}:${infer P}`
    ? P
    : never;

export type MappedTemplateOutput<T extends Record<string, unknown>> = RemapWithTemplate<T> & MapPayloadByTemplate<T>;

export type PathTemplateIndex<T extends Record<string, Record<string, unknown>>> = {
  [K in keyof T as K & string]: {
    [P in keyof T[K] as P & string]: {
      readonly key: `${K & string}.${P & string}`;
      readonly value: T[K][P];
    };
  };
};

export const compileTemplates = <const T extends Record<string, string>>(catalog: T) => {
  const out = {} as RouteTemplateMap<T>;
  for (const [name, raw] of Object.entries(catalog) as Array<[keyof T & string, T[keyof T & string]]>) {
    const tokens = raw.split('/') as string[];
    const params = tokens.filter((token) => token.startsWith(':')).map((token) => token.slice(1));
    const template = raw as unknown as TemplateUnion<T[keyof T & string]>;
    const keyUnion = params[0] as unknown as TemplateToParams<T[keyof T & string]>;
    out[name] = {
      raw,
      segments: template,
      keys: keyUnion,
    };
  }
  return out as unknown as RouteTemplateMap<T>;
};

export const buildMappedPayload = <const T extends Record<string, unknown>>(input: T): MappedTemplateOutput<T> => {
  return input as unknown as MappedTemplateOutput<T>;
};

export type RuntimeCatalog<T extends Record<string, unknown>> = {
  readonly [K in keyof T as `catalog_${K & string}`]-?: T[K];
} & {
  readonly map: RouteBag<Record<string, Record<string, unknown>>>;
};
