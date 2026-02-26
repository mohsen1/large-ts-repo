export interface AtlasMetaEnvelope {
  readonly metaCarrier: string;
  readonly tenant: string;
  readonly recordedAt: number;
}

export interface AtlasPayloadEnvelope {
  readonly payloadCarrier: string;
  readonly payload: Record<string, unknown>;
  readonly version: number;
}

export interface AtlasTraceEnvelope {
  readonly traceCarrier: string;
  readonly trace: readonly string[];
  readonly severity: 'low' | 'medium' | 'high';
}

export type AtlasEnvelope = AtlasMetaEnvelope & AtlasPayloadEnvelope & AtlasTraceEnvelope;

export type AtlasEnvelopeKeys<T extends AtlasMetaEnvelope & AtlasPayloadEnvelope & AtlasTraceEnvelope> = {
  readonly metadataKey: keyof T['metaCarrier'];
  readonly payloadKey: keyof T['payloadCarrier'];
  readonly traceKey: keyof T['traceCarrier'];
};

export type DisjointInputSegment<T> = {
  readonly [K in keyof T as `input_${string & K}`]: {
    readonly value: T[K];
    readonly hasValue: true;
  };
};

export type DisjointOutputSegment<T> = {
  readonly [K in keyof T as `output_${string & K}`]: {
    readonly value: T[K];
    readonly complete: true;
  };
};

export type DisjointMetaSegment<T> = {
  readonly [K in keyof T as `meta_${string & K}`]: {
    readonly marker: K;
    readonly payload: T[K];
  };
};

export type DisjointFactoryResult<T> =
  DisjointInputSegment<T> &
  DisjointOutputSegment<T> &
  DisjointMetaSegment<T>;

export type WrappedRoutePart<T> =
  T extends {
    input: infer I;
    output: infer O;
    meta: infer M;
  }
    ? {
        readonly wrappedInput: I & { readonly kind: 'input' };
        readonly wrappedOutput: O & { readonly kind: 'output' };
        readonly wrappedMeta: M & { readonly kind: 'meta' };
      }
    : never;

export type InputShape<T> = {
  readonly input: T;
};

export type OutputShape<T> = {
  readonly output: T;
};

export type MetaShape<T> = {
  readonly meta: T;
};

export type RouteEnvelope<T> = WrappedRoutePart<
  InputShape<T> & OutputShape<T> & MetaShape<T>
>;

export const createDisjointEnvelope = <T extends Record<string, unknown>>(value: T): DisjointFactoryResult<T> => {
  const inputEntries = Object.entries(value).map(([key, item]) => ({
    [key]: {
      value: item,
      hasValue: true,
    },
  }));

  const outputEntries = Object.entries(value).map(([key, item]) => ({
    [key]: {
      value: item,
      complete: true,
    },
  }));

  const metaEntries = Object.entries(value).map(([key, item]) => ({
    [key]: {
      marker: key,
      payload: item,
    },
  }));

  const input = Object.assign({}, ...inputEntries);
  const output = Object.assign({}, ...outputEntries);
  const meta = Object.assign({}, ...metaEntries);

  const remapInput = Object.fromEntries(
    Object.keys(input).map((key) => [`input_${key}`, input[key as keyof typeof input]]),
  ) as DisjointInputSegment<T>;

  const remapOutput = Object.fromEntries(
    Object.keys(output).map((key) => [`output_${key}`, output[key as keyof typeof output]]),
  ) as DisjointOutputSegment<T>;

  const remapMeta = Object.fromEntries(
    Object.keys(meta).map((key) => [`meta_${key}`, meta[key as keyof typeof meta]]),
  ) as DisjointMetaSegment<T>;

  return {
    ...remapInput,
    ...remapOutput,
    ...remapMeta,
  };
};

export const routeBundleCatalogSeed = [
  {
    tenant: 'north',
    operation: 'activate',
    region: 'us-east',
  },
  {
    session: 's-901',
    operator: 'orchestrator',
    lane: 'alpha',
  },
  {
    workflow: 'w-001',
    policy: 'p-900',
    mode: 'strict',
  },
] as const;

export type RouteBundle = ReturnType<typeof createDisjointEnvelope<typeof routeBundleCatalogSeed[number]>>;

export const routeBundleCatalog = [
  ...routeBundleCatalogSeed.map((entry) => createDisjointEnvelope(entry)),
] as const satisfies readonly RouteBundle[];

export const routeEnvelopeIndex = routeBundleCatalog.map((entry) => {
  const keys = new Set<string>(Object.keys(entry));
  return {
    size: keys.size,
    keys: Array.from(keys),
  };
});

export const routeBundleReducer = (items: readonly RouteBundle[]) => {
  return items.reduce((acc, item) => {
    const keys = Object.keys(item);
    return {
      ...acc,
      count: acc.count + 1,
      keys,
      latest: item,
    };
  }, { count: 0, keys: [] as string[], latest: null as RouteBundle | null });
};

export const isAtlasEnvelope = (value: unknown): value is AtlasEnvelope => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'metaCarrier' in value &&
    'payloadCarrier' in value &&
    'traceCarrier' in value
  );
};

export type EnrichedAtlasEnvelope = {
  readonly meta: Pick<AtlasMetaEnvelope, 'metaCarrier' | 'tenant'> & {
    readonly source: 'router';
  };
  readonly payload: Omit<AtlasPayloadEnvelope, 'payload'> & {
    readonly payload: string;
  };
  readonly trace: Omit<AtlasTraceEnvelope, 'trace'> & {
    readonly trace: readonly string[];
    readonly channel: 'ws';
  };
};

export type RouteProjection<A extends AtlasEnvelope> = {
  readonly sourceMeta: {
    readonly carrier: A['metaCarrier'];
    readonly tenant: A['tenant'];
  };
  readonly payloadProfile: {
    readonly carrier: A['payloadCarrier'];
    readonly version: A['version'];
  };
  readonly traceProfile: {
    readonly carrier: A['traceCarrier'];
    readonly severity: A['severity'];
  };
};

export const projectRouteBundle = <A extends AtlasEnvelope>(bundle: A): RouteProjection<A> => {
  return {
    sourceMeta: {
      carrier: bundle.metaCarrier,
      tenant: bundle.tenant,
    },
    payloadProfile: {
      carrier: bundle.payloadCarrier,
      version: bundle.version,
    },
    traceProfile: {
      carrier: bundle.traceCarrier,
      severity: bundle.severity,
    },
  };
};
