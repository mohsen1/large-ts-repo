export type PrimitiveToken = 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'symbol' | 'bigint' | 'object' | 'function';

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type ModifierPreserve<T> = {
  readonly keep: true;
  readonly payload: T;
};

export type TemplateCase<T> = T extends string
  ? `str:${T}`
  : T extends number
    ? `num:${T}`
    : T extends boolean
      ? `bool:${T}`
      : T extends null
        ? 'null'
        : T extends undefined
          ? 'undefined'
          : T extends symbol
            ? `sym:${string & { toString: never }}`
            : 'other';

export type MapTemplateField<
  TObject extends Record<string, unknown>,
  TPrefix extends string,
  TDiscriminator extends string,
> = {
  [K in keyof TObject as K extends string ? `${TPrefix}${K}` : never]: K extends string
    ? ModifierPreserve<{
        readonly key: K;
        readonly value: TPrefix extends '' ? TObject[K] : TemplateCase<TObject[K]>;
        readonly tag: `${TDiscriminator}:${TemplateCase<TObject[K]>}`;
        readonly source: K;
      }>
    : never;
};

export type DeepMappedByKind<T extends Record<string, unknown>, TDepth extends number = 3> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? { [P in keyof T[K] as `${K & string}_${P & string}`]: MapTemplateField<T[K], `${P & string}`, TDepth extends 0 ? 'leaf' : 'node'> }
    : T[K];
};

export type EventChannelMap<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends ReadonlyArray<infer V>
    ? { kind: 'array'; values: ReadonlyArray<V> }
    : T[K] extends Record<string, unknown>
      ? { kind: 'object'; value: EventChannelMap<T[K] & Record<string, unknown>> }
      : { kind: 'value'; value: T[K] };
};

export type EventRouteTemplate<T extends Record<string, unknown>, TNamespace extends string = 'recovery'> = {
  [K in keyof T as `${TNamespace}/${K & string}`]: T[K] extends object
    ? MapTemplateField<T[K] & Record<string, unknown>, `${K & string}`, 'obj'>
    : never;
};

export type RouteSchemaKeys<T extends Record<string, unknown>> = {
  [K in keyof T]: K extends `meta-${string}` ? never : `route-${K & string}`;
};

export type RoutePayloadMap<T extends Record<string, unknown>> = {
  [K in keyof RouteSchemaKeys<T> as RouteSchemaKeys<T>[K]]: T[K] extends Record<string, unknown>
    ? {
        readonly schema: EventRouteTemplate<T[K] & Record<string, unknown>, K & string>;
        readonly transformed: PreserveModifiers<T[K]>;
      }
    : T[K];
};

export type PreserveModifiers<T> = {
  readonly [K in keyof T]: T[K] extends Function
    ? never
    : T[K] extends ReadonlyArray<infer U>
      ? readonly U[]
      : T[K];
};

export type RecursiveTemplateMap<T extends Record<string, unknown>> = {
  [K in keyof T & string]: T[K] extends infer V
    ? V extends string
      ? `${K}:${V}`
      : V extends number
        ? `${K}:${V}`
        : string
    : never;
};

export type MatrixBuilderInput = {
  readonly serviceName: string;
  readonly endpoints: ReadonlyArray<{
    readonly path: string;
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly payload: Record<string, unknown>;
  }>;
  readonly metadata?: Record<string, unknown>;
  readonly options?: {
    readonly includeQuery?: boolean;
    readonly includeBody?: boolean;
    readonly includeResponse?: boolean;
  };
};

type EndpointTemplateEntry<TInput extends MatrixBuilderInput, TKey extends keyof TInput['endpoints']> = TKey extends keyof TInput['endpoints']
  ? TInput['endpoints'][TKey] extends {
      readonly path: infer P;
      readonly payload: infer Payload;
    }
    ? P extends string
      ? MapTemplateField<Payload & Record<string, unknown>, `${P}`, 'endpoint'>
      : never
    : never
  : never;

type EndpointTemplateKey<TKey> = TKey extends `${number}` ? `endpoint_${TKey & string}` : never;

export type BuildRouteTemplate<TInput extends MatrixBuilderInput> = {
  [K in keyof TInput['endpoints'] as EndpointTemplateKey<K>]: EndpointTemplateEntry<TInput, K>;
};

export type BuildTemplateRouteMap<T extends Record<string, unknown>> = {
  [K: `endpoint_${string}`]: {
    readonly schema: RoutePayloadMap<T>;
  };
};

export type ConstrainedMapping<T extends Record<string, unknown>> = {
  readonly input: T;
  readonly mapped: DeepMappedByKind<T>;
  readonly template: RoutePayloadMap<T>;
  readonly channels: EventChannelMap<T>;
};

export type FlattenTemplateMatrix<T> = T extends Record<string, infer V>
  ? { [K in keyof T]: V extends infer N ? NestedTemplateEntry<K & string, N> : never }
  : never;

export type NestedTemplateEntry<TPrefix extends string, TInput> = TInput extends readonly (infer Item)[]
  ? `${TPrefix}[]:${Item & string}`
  : TInput extends Record<string, unknown>
    ? { [K in keyof TInput & string]: NestedTemplateEntry<`${TPrefix}${K}.`, TInput[K]> }
    : `${TPrefix}:${TemplateCase<TInput>}`;

export const makeEventPayload = (input: MatrixBuilderInput): ConstrainedMapping<MatrixBuilderInput> => {
  const template: RoutePayloadMap<MatrixBuilderInput> = Object.fromEntries(
    input.endpoints.map((endpoint) => [
      endpoint.path,
      {
        schema: endpoint.payload as Record<string, unknown>,
        transformed: endpoint.payload,
      },
    ]),
  ) as unknown as RoutePayloadMap<MatrixBuilderInput>;

  return {
    input,
    mapped: {} as DeepMappedByKind<MatrixBuilderInput>,
    template,
    channels: {} as EventChannelMap<MatrixBuilderInput>,
  };
};

export const createTemplateOrbit = <T extends MatrixBuilderInput>(input: T): BuildRouteTemplate<T> => {
  const values = input.endpoints.reduce<Record<string, Record<string, string>>>((acc, endpoint) => {
    acc[`${endpoint.method}:${endpoint.path}`] = Object.fromEntries(
      Object.entries(endpoint.payload).map(([key, value]) => [`${key}`, `${key}:${String(value)}`]),
    );
    return acc;
  }, {});

  return values as unknown as BuildRouteTemplate<T>;
};

export const buildTemplateOrbit = createTemplateOrbit;

export const buildTemplateRouteMap = <
  TInput extends MatrixBuilderInput,
  TNoInfer extends MatrixBuilderInput = NoInfer<TInput>,
>(input: TNoInfer): BuildTemplateRouteMap<TNoInfer['endpoints'][number]['payload']> => {
  const map = Object.fromEntries(
    input.endpoints.map((endpoint) => [
      `route-${endpoint.path}`,
      { schema: {} as RoutePayloadMap<TNoInfer['endpoints'][number]['payload']> },
    ]),
  ) as unknown as BuildTemplateRouteMap<TNoInfer['endpoints'][number]['payload']>;

  return map;
};
