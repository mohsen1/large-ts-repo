export type TransformMode = 'raw' | 'json' | 'wire' | 'compressed';

export type PrimitivePayload = string | number | boolean | bigint | null;

export interface BaseTemplateRecord {
  readonly routeId: string;
  readonly mode: TransformMode;
  readonly correlationId: string;
}

export interface WireEnvelope {
  readonly id: string;
  readonly active: boolean;
  readonly metadata: Record<string, string>;
}

export type RenameFields<T, P extends string> = {
  [K in keyof T as `${P}_${K & string}`]: T[K];
};

export type TemplateTransform<T> = T extends PrimitivePayload
  ? T
  : T extends Array<infer U>
    ? readonly TemplateTransform<U>[]
    : T extends Record<string, unknown>
      ? {
          [K in keyof T as K extends string ? `field_${PCase<K & string>}` : never]: T[K] extends object
            ? TemplateTransform<T[K]>
            : T[K];
        }
      : T;

type PCase<T extends string> = T extends `${infer Head}_${infer Tail}`
  ? `${Uppercase<Head>}${PCase<Tail>}`
  : Capitalize<T>;

export type ExpandTemplate<T> =
  T extends BaseTemplateRecord
    ? RenameFields<TemplateTransform<Omit<T, 'correlationId'>>, 'base'> & { baseCorrelation: T['correlationId'] }
    : RenameFields<TemplateTransform<T>, 'nested'>;

export type TemplateBundle<TPayload extends readonly unknown[]> = {
  [K in keyof TPayload]: TPayload[K] extends BaseTemplateRecord
    ? ExpandTemplate<TPayload[K]>
    : TemplateTransform<TPayload[K]>;
};

export type EnvelopeMap<T extends Record<string, BaseTemplateRecord>> = {
  [K in keyof T as `${K & string}_envelope`]: ExpandTemplate<T[K]>;
};

export type RouteTemplate<T extends string> = T extends `/${infer Surface}/${infer Entity}/${infer Action}`
  ? {
      readonly route: T;
      readonly surface: Surface;
      readonly entity: Entity;
      readonly action: Action;
    }
  : never;

export type RemapCatalog<T extends readonly string[]> = {
  [K in T[number] as K extends string ? `route::${K}` : never]: K extends string
    ? RouteTemplate<K>
    : never;
};

export interface CatalogTemplate {
  readonly routes: readonly string[];
  readonly envelopes: Record<string, WireEnvelope>;
}

export interface RouteTemplateResult {
  readonly templates: EnvelopeMap<Record<string, BaseTemplateRecord>>;
  readonly bundle: readonly [ExpandTemplate<BaseTemplateRecord>, ExpandTemplate<WireEnvelope>];
  readonly remap: RemapCatalog<readonly ['/ops/agent/recover', '/ops/node/recover', '/ops/policy/adjust']>;
}

export const templateCatalogSeed = {
  routes: ['/ops/agent/recover', '/ops/node/recover', '/ops/policy/adjust'],
  envelopes: {
    alpha: {
      id: 'alpha',
      active: true,
      metadata: { mode: 'primary', owner: 'registry' },
    },
  },
} satisfies CatalogTemplate;

export const projectTemplate = <T>(value: T): ExpandTemplate<T> => {
  return value as ExpandTemplate<T>;
};

export const buildTemplateBundle = (
  records: readonly BaseTemplateRecord[],
): TemplateBundle<typeof records> => {
  return records as unknown as TemplateBundle<typeof records>;
};

export const mapEnvelopeKeys = <T extends Record<string, BaseTemplateRecord>>(input: T): EnvelopeMap<T> => {
  const entries = Object.entries(input);
  const mapped = {} as unknown as Record<string, unknown>;
  for (const [key, item] of entries) {
    const transformed = projectTemplate(item);
    mapped[`${key}_envelope`] = {
      ...transformed,
      baseCorrelation: item.correlationId,
    };
  }
  return mapped as EnvelopeMap<T>;
};

export const parseTemplate = <T extends string>(template: T): RouteTemplate<T> => {
  const [, surface, entity, action] = template.split('/') as [string, string, string, string];
  return {
    route: template,
    surface,
    entity,
    action,
  } as RouteTemplate<T>;
};
