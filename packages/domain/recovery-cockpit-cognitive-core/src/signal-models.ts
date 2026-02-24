import { z } from 'zod';
import {
  Brand,
  NoInfer,
  Prettify,
  NonEmptyArray,
  RecursivePath,
} from '@shared/type-level';

export const signalLayers = ['readiness', 'continuity', 'drift', 'policy', 'anomaly', 'capacity'] as const;
export type SignalLayer = (typeof signalLayers)[number];

export const signalKinds = ['forecast', 'readiness', 'command', 'observed', 'compliance', 'risk'] as const;
export type SignalKind = (typeof signalKinds)[number];

export const signalChannels = ['telemetry', 'control', 'policy', 'advisor', 'audit'] as const;
export type SignalChannel = (typeof signalChannels)[number];

export const signalSeverities = ['info', 'notice', 'warning', 'degraded', 'critical'] as const;
export type SignalSeverity = (typeof signalSeverities)[number];

export const signalPriorities = ['low', 'medium', 'high', 'critical'] as const;
export type SignalPriority = (typeof signalPriorities)[number];

export type SignalRunId = Brand<string, 'cockpit-signal-run-id'>;
export type SignalEnvelopeId = Brand<string, 'cockpit-signal-envelope-id'>;

export type LayerRoute<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? Tail extends []
    ? Head
    : `${Head}/${LayerRoute<Tail>}`
  : 'root';

export type LayerRouteParts<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? readonly [Head, ...LayerRouteParts<Tail>]
  : readonly [];

export interface SignalRoutingKey<TParts extends readonly string[] = readonly string[]> {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly parts: readonly [...TParts];
}

export interface SignalTelemetryState {
  readonly score: number;
  readonly confidence: number;
  readonly drift: number;
}

export interface ReadinessPayload {
  readonly projectionId: string;
  readonly expectedMinutes: number;
  readonly states: readonly SignalTelemetryState[];
}

export interface ForecastPayload {
  readonly modelId: string;
  readonly horizonMinutes: number;
  readonly samples: readonly {
    readonly at: string;
    readonly estimate: number;
    readonly baseline: number;
  }[];
}

export interface CommandPayload {
  readonly commandId: string;
  readonly target: string;
  readonly args: Readonly<Record<string, string | number | boolean>>;
}

export interface ObservedPayload {
  readonly source: string;
  readonly metric: string;
  readonly values: readonly {
    readonly at: string;
    readonly value: number;
  }[];
}

export interface CompliancePayload {
  readonly policyId: string;
  readonly ruleCodes: readonly string[];
  readonly controls: readonly {
    readonly controlId: string;
    readonly status: 'pass' | 'warn' | 'fail';
  }[];
}

export interface RiskPayload {
  readonly scenarioId: string;
  readonly risk: number;
  readonly tags: readonly string[];
  readonly mitigations: readonly string[];
}

export interface SignalEnvelope<
  TKind extends SignalKind = SignalKind,
  TPayload = SignalKindPayload<TKind>,
  TLayer extends SignalLayer = SignalLayer,
> {
  readonly id: SignalEnvelopeId;
  readonly runId: SignalRunId;
  readonly kind: TKind;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly layer: TLayer;
  readonly channel: SignalChannel;
  readonly severity: SignalSeverity;
  readonly priority: SignalPriority;
  readonly emittedAt: string;
  readonly routing: SignalRoutingKey;
  readonly payload: TPayload;
  readonly tags: Readonly<Record<string, readonly string[]>>;
}

export type SignalKindPayload<K extends SignalKind = SignalKind> = K extends 'forecast'
  ? ForecastPayload
  : K extends 'readiness'
    ? ReadinessPayload
    : K extends 'command'
      ? CommandPayload
      : K extends 'observed'
        ? ObservedPayload
        : K extends 'compliance'
          ? CompliancePayload
          : K extends 'risk'
            ? RiskPayload
            : unknown;

export type AnySignalEnvelope = {
  [K in SignalKind]: SignalEnvelope<K, SignalKindPayload<K>>;
}[SignalKind];

export type LayeredSignals<TSignals extends readonly AnySignalEnvelope[]> = {
  [Layer in SignalLayer]: TSignals[number] extends infer Entry
    ? Entry extends { layer: Layer }
      ? Entry
      : never
    : never;
};

export type SignalManifest<TSignals extends readonly AnySignalEnvelope[]> = {
  [Index in keyof TSignals as TSignals[Index] extends AnySignalEnvelope
    ? TSignals[Index]['id']
    : never]: TSignals[Index];
};

export const forecastPayloadSchema = z.object({
  modelId: z.string().min(1),
  horizonMinutes: z.number().positive().finite(),
  samples: z.array(
    z.object({
      at: z.string().datetime({ offset: true }),
      estimate: z.number(),
      baseline: z.number(),
    }),
  ),
});

export const readinessPayloadSchema = z.object({
  projectionId: z.string().min(1),
  expectedMinutes: z.number().positive().int(),
  states: z.array(
    z.object({
      score: z.number().min(0).max(100),
      confidence: z.number().min(0).max(1),
      drift: z.number().min(0).max(1),
    }),
  ),
});

export const commandPayloadSchema = z.object({
  commandId: z.string().min(1),
  target: z.string().min(1),
  args: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

export const observedPayloadSchema = z.object({
  source: z.string().min(1),
  metric: z.string().min(1),
  values: z.array(
    z.object({
      at: z.string().datetime({ offset: true }),
      value: z.number(),
    }),
  ),
});

export const compliancePayloadSchema = z.object({
  policyId: z.string().min(1),
  ruleCodes: z.array(z.string().min(1)),
  controls: z.array(
    z.object({
      controlId: z.string().min(1),
      status: z.enum(['pass', 'warn', 'fail']),
    }),
  ),
});

export const riskPayloadSchema = z.object({
  scenarioId: z.string().min(1),
  risk: z.number().min(0).max(1),
  tags: z.array(z.string()),
  mitigations: z.array(z.string()),
});

export const routingSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  parts: z.array(z.string().min(1)),
});

const baseSignalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  layer: z.enum(signalLayers),
  channel: z.enum(signalChannels),
  severity: z.enum(signalSeverities),
  priority: z.enum(signalPriorities),
  emittedAt: z.string().datetime({ offset: true }),
  routing: routingSchema,
  tags: z.record(z.array(z.string())),
});

const forecastEnvelopeSchema = baseSignalSchema.extend({
  kind: z.literal('forecast'),
  payload: forecastPayloadSchema,
});

const readinessEnvelopeSchema = baseSignalSchema.extend({
  kind: z.literal('readiness'),
  payload: readinessPayloadSchema,
});

const commandEnvelopeSchema = baseSignalSchema.extend({
  kind: z.literal('command'),
  payload: commandPayloadSchema,
});

const observedEnvelopeSchema = baseSignalSchema.extend({
  kind: z.literal('observed'),
  payload: observedPayloadSchema,
});

const complianceEnvelopeSchema = baseSignalSchema.extend({
  kind: z.literal('compliance'),
  payload: compliancePayloadSchema,
});

const riskEnvelopeSchema = baseSignalSchema.extend({
  kind: z.literal('risk'),
  payload: riskPayloadSchema,
});

export const anySignalSchema = z.discriminatedUnion('kind', [
  forecastEnvelopeSchema,
  readinessEnvelopeSchema,
  commandEnvelopeSchema,
  observedEnvelopeSchema,
  complianceEnvelopeSchema,
  riskEnvelopeSchema,
]);

export type SignalRouteTuple = NonEmptyArray<string>;
export type SignalRouteValue = string;

export const signalSchemaByKind = {
  forecast: forecastPayloadSchema,
  readiness: readinessPayloadSchema,
  command: commandPayloadSchema,
  observed: observedPayloadSchema,
  compliance: compliancePayloadSchema,
  risk: riskPayloadSchema,
} as const satisfies Record<SignalKind, z.ZodTypeAny>;

export const signalRoute = (route: NoInfer<readonly string[]>): LayerRoute<typeof route> =>
  (route.join('/') || 'root') as LayerRoute<typeof route>;

export const routeFingerprint = (route: SignalRoutingKey): SignalRouteValue =>
  `/${route.tenantId}/${route.workspaceId}/${route.parts.join('/')}`;

export const buildSignalRoute = <
  TRoute extends readonly string[],
>(tenantId: string, workspaceId: string, route: NoInfer<TRoute>): SignalRoutingKey<TRoute> => ({
  tenantId,
  workspaceId,
  parts: route,
});

type LayerSignalBuckets<TSignals extends readonly AnySignalEnvelope[]> = {
  [Layer in SignalLayer]: TSignals[number][];
};

export const layerSignalMap = <
  TSignals extends readonly AnySignalEnvelope[],
>(signals: TSignals): LayeredSignals<TSignals> => {
  const buckets = signalLayers.reduce(
    (acc, layer) => {
      acc[layer] = [];
      return acc;
    },
    {} as LayerSignalBuckets<TSignals>,
  );
  for (const signal of signals) {
    buckets[signal.layer].push(signal as TSignals[number]);
  }
  return buckets as LayeredSignals<TSignals>;
};

export const describeSignalPath = (path: LayerRouteParts<readonly string[]>) => {
  if (!path.length) {
    return '';
  }
  const head = path.at(0);
  if (!head) {
    return '';
  }
  const tail = [...path.slice(1)] as string[];

  const suffix = tail.length ? `/${tail.join('/')}` : '';
  return `${head}${suffix}`;
};

export const validateSignalEnvelope = (value: unknown): value is AnySignalEnvelope => {
  return anySignalSchema.safeParse(value).success;
};

export const summarizeSignalEnvelope = <
  TSignals extends readonly AnySignalEnvelope[],
>(
  signals: TSignals,
): {
  readonly total: number;
  readonly layers: Readonly<Record<SignalLayer, number>>;
  readonly kinds: Readonly<Record<SignalKind, number>>;
  readonly routePath: RecursivePath<{ [K in SignalLayer]: Readonly<Record<string, string>> }>;
} => {
  const layers = signalLayers.reduce(
    (acc, layer) => ({ ...acc, [layer]: 0 }),
    {} as Record<SignalLayer, number>,
  );
  const kinds = signalKinds.reduce(
    (acc, kind) => ({ ...acc, [kind]: 0 }),
    {} as Record<SignalKind, number>,
  );
  const routePath = {} as RecursivePath<{
    [K in SignalLayer]: Readonly<Record<string, string>>;
  }>;

  for (const signal of signals) {
    layers[signal.layer] += 1;
    kinds[signal.kind] += 1;
  }

  return {
    total: signals.length,
    layers,
    kinds,
    routePath,
  } satisfies Prettify<{
    total: number;
    layers: Record<SignalLayer, number>;
    kinds: Record<SignalKind, number>;
    routePath: RecursivePath<{ [K in SignalLayer]: Readonly<Record<string, string>> }>;
  }>;
};

export const coerceSignalId = (value: string): SignalEnvelopeId => `${value}::signal` as SignalEnvelopeId;
export const coerceRunId = (value: string): SignalRunId => `${value}::run` as SignalRunId;

export const extractRouteValue = <T extends SignalRoutingKey>(
  route: NoInfer<T>,
  index: number,
): string | undefined => route.parts.at(index);
