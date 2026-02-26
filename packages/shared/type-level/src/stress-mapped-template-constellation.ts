export interface SourceEventPayload {
  [key: string]: unknown;
  readonly entityId: string;
  readonly tenant: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface SourceEnvelope {
  [key: string]: unknown;
  readonly requestId: `req-${string}`;
  readonly createdAt: `${number}-${number}-${number}T${number}:${number}:${number}Z`;
}

export type EventInput = SourceEventPayload & SourceEnvelope;

export type EventToken<T extends string> = T extends `${infer Prefix}:${infer Suffix}` ? `${Prefix}::${Suffix}` : `token:${T}`;

export type EventNamespace<T extends string> = `namespace:${T}`;

type Preserve<T> = T;

type RemapTopLevel<T extends Record<string, unknown>> = {
  [K in keyof T & string as EventNamespace<K>]: Preserve<T[K]>;
};

type NestedProjection<TValue> = TValue extends Record<string, unknown>
  ? {
    readonly [K in keyof TValue & string as `meta.${K}`]: Preserve<TValue[K]>;
  }
  : Preserve<TValue>;

type RemapNested<T extends Record<string, unknown>> = {
  [K in keyof T & string as `meta.${K}`]: NestedProjection<T[K]>;
};

type RemapMutable<T extends Record<string, unknown>> = {
  readonly [K in keyof T & string as `mutable.${K}`]: T[K] extends readonly unknown[]
    ? { readonly [I in keyof T[K]]: T[K][I] }
    : Preserve<T[K]>;
};

type MergeMapped<T extends Record<string, unknown>> =
  RemapTopLevel<T> & { [K in keyof RemapNested<T>]: RemapNested<T>[K] } & RemapMutable<T>;

export type EventTransform<T extends Record<string, unknown>> = Readonly<MergeMapped<T>>;

export type EventTemplateMap<T extends Record<string, EventInput>> = {
  [K in keyof T & string]: {
    readonly raw: K;
    readonly transformed: EventTransform<T[K]>;
    readonly key: EventToken<K>;
    readonly required: keyof EventTransform<T[K]>;
    readonly requiredMutable: keyof EventTransform<T[K]>;
  };
};

export const sourceCatalog = {
  incident: {
    entityId: 'incident-1',
    tenant: 'alpha',
    severity: 'critical',
    requestId: 'req-1000',
    createdAt: '2026-02-26T12:13:14Z',
  },
  workload: {
    entityId: 'workload-2',
    tenant: 'beta',
    severity: 'medium',
    requestId: 'req-2000',
    createdAt: '2026-02-26T12:13:15Z',
  },
  signal: {
    entityId: 'signal-3',
    tenant: 'gamma',
    severity: 'low',
    requestId: 'req-3000',
    createdAt: '2026-02-26T12:13:16Z',
  },
} as const satisfies Record<string, EventInput>;

export type SourceTemplateCatalog = EventTemplateMap<typeof sourceCatalog>;

const toEventTransform = <T extends Record<string, unknown>>(input: T): EventTransform<T> => {
  const base = {
    ...Object.fromEntries(
      Object.entries(input).map(([rawKey, value]) => [`namespace.${rawKey}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(input).map(([rawKey, value]) => [`meta.${rawKey}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(input).map(([rawKey, value]) => [`mutable.${rawKey}`, value]),
    ),
  } as Record<string, unknown>;

  return base as EventTransform<T>;
};

export const transformSourceCatalog = <T extends Record<string, EventInput>>(input: T): EventTemplateMap<T> => {
  const output: Partial<EventTemplateMap<T>> = {};

  for (const key of Object.keys(input) as Array<keyof T & string>) {
    const item = input[key] as Record<string, unknown>;
    const transformed = toEventTransform(item);
    const outputKeys = Object.keys(transformed) as Array<keyof EventTransform<typeof item> & string>;

    output[key] = {
      raw: key,
      transformed: transformed as EventTransform<T[typeof key]>,
      key: `token:${key}` as EventToken<typeof key>,
      required: outputKeys as Array<keyof EventTransform<T[typeof key]> & string>,
      requiredMutable: outputKeys as Array<keyof EventTransform<T[typeof key]> & string>,
    } as unknown as EventTemplateMap<T>[typeof key];
  }

  return output as EventTemplateMap<T>;
};

export const sourceEventGrid = transformSourceCatalog(sourceCatalog);
