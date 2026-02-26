type PrimitiveValue = string | number | boolean | null | undefined;

export type SignalKind = 'control' | 'metric' | 'status' | 'inventory' | 'diagnostic';
export type SignalVerb = 'probe' | 'diff' | 'trace' | 'index' | 'synthesize' | 'evaluate';
export type SignalScope<T extends SignalKind> = T extends 'control'
  ? 'fleet'
  : T extends 'metric'
    ? 'collect'
    : T extends 'status'
      ? 'health'
      : 'analysis';

type RemapTop<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T & string as `${Prefix}/${K}`]: T[K];
};

type RemapLeaf<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T & string as `${Prefix}/${K}`]:
    T[K] extends Record<string, unknown> ? RemapLeaf<T[K], `${Prefix}/${K}`> : T[K];
};

type ShallowMerge<T extends Record<string, unknown>> = {
  [K in keyof T & string as `${K}-tpl`]: T[K];
};

export type PreserveModifiers<T> = {
  [K in keyof T]: T[K];
};

export type NestedTemplateMap<T extends Record<string, unknown>> = PreserveModifiers<{
  [K in keyof T & string]:
    T[K] extends PrimitiveValue ? `${K}-leaf`
      : T[K] extends Record<string, unknown> ? {
          [R in keyof T[K] & string as `${K}/${R}`]: T[K][R] extends PrimitiveValue
            ? `${R}-leaf`
            : {
                [D in keyof T[K][R] & string as `${K}/${R}/${D}`]: T[K][R][D];
              };
        }
      : never;
}>;

export type RuntimeTemplateShape = {
  readonly control: {
    readonly metric: {
      readonly label: string;
      readonly unit: string;
    };
    readonly state: {
      readonly healthy: boolean;
      readonly value: number;
    };
  };
  readonly metric: {
    readonly throughput: {
      readonly current: number;
      readonly limit: number;
    };
    readonly latency: {
      readonly p50: number;
      readonly p95: number;
    };
  };
};

export const signalRuntimeShape = {
  control: {
    metric: { label: 'ctrl', unit: 'ms' },
    state: { healthy: true, value: 1 },
  },
  metric: {
    throughput: { current: 100, limit: 200 },
    latency: { p50: 3, p95: 8 },
  },
} as const satisfies RuntimeTemplateShape;

export const mappedRuntimeTemplate = {
  top: {} as RemapTop<RuntimeTemplateShape, 'root'>,
  leaf: {} as RemapLeaf<RuntimeTemplateShape, 'root'>,
};

type EnvelopeType = ShallowMerge<RuntimeTemplateShape>;

export const signalTemplateEnvelope = {
  'control-tpl': signalRuntimeShape.control,
  'metric-tpl': signalRuntimeShape.metric,
} as unknown as PreserveModifiers<EnvelopeType>;

const normalizeTemplateMap = <T extends Record<string, unknown>>(input: T): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    out[`${key}/template`] = JSON.stringify(value);
  }
  return out;
};

export const buildTemplateMap = <const T extends RuntimeTemplateShape>(input: T = signalRuntimeShape as T) => {
  const normalized = normalizeTemplateMap(input as Record<string, unknown>);
  const mapped: PreserveModifiers<NestedTemplateMap<T>> = input as unknown as PreserveModifiers<NestedTemplateMap<T>>;
  return {
    normalized,
    projected: (mappedRuntimeTemplate.top as unknown) as RemapTop<T, 'root'>,
    mapped,
    union: Object.keys(mapped) as ReadonlyArray<keyof NestedTemplateMap<T>>,
    scope: 'fleet',
  };
};

export const templateMap = buildTemplateMap();
export const templateProjection = templateMap.projected;
export const templateNested = templateMap.mapped;
export const templateRouteKind = 'fleet';
