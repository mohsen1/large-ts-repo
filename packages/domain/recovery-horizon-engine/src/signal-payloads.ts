import {
  type HorizonSignal,
  type PluginStage,
  type JsonLike,
  type TimeMs,
  horizonBrand,
} from './types.js';

export type SignalVerb = 'emit' | 'relay' | 'drop' | 'mutate' | 'archive';

export type StageSignalPayload<TKind extends PluginStage, TBody extends Record<string, JsonLike> = Record<string, JsonLike>> = {
  readonly kind: TKind;
  readonly verb: SignalVerb;
  readonly timestamp: TimeMs;
  readonly body: TBody;
  readonly trace: readonly string[];
};

export type SignalEnvelope<
  TStage extends PluginStage = PluginStage,
  TBody extends Record<string, JsonLike> = Record<string, JsonLike>,
> = {
  readonly id: string;
  readonly stage: TStage;
  readonly payload: StageSignalPayload<TStage, TBody>;
  readonly generatedAt: string;
};

export type SignalEnvelopeTuple<TBody extends Record<string, JsonLike>> = readonly StageSignalPayload<PluginStage, TBody>[];

export interface SignalChannel<TStage extends PluginStage, TBody extends Record<string, JsonLike> = Record<string, JsonLike>> {
  readonly stage: TStage;
  readonly signals: readonly SignalEnvelope<TStage, TBody>[];
}

export interface SignalMutation<TStage extends PluginStage, TBody extends Record<string, JsonLike> = Record<string, JsonLike>> {
  readonly stage: TStage;
  readonly before: StageSignalPayload<TStage, TBody>;
  readonly after: StageSignalPayload<TStage, TBody>;
  readonly reason: string;
}

export interface SignalBucket<TStage extends PluginStage, TBody extends Record<string, JsonLike> = Record<string, JsonLike>> {
  readonly tenantId: string;
  readonly stage: TStage;
  readonly history: readonly SignalMutation<TStage, TBody>[];
  readonly lastModified: TimeMs;
}

export type MutableSignal<TStage extends PluginStage, TBody extends Record<string, JsonLike> = Record<string, JsonLike>> = {
  readonly [K in keyof SignalEnvelope<TStage, TBody>]: SignalEnvelope<TStage, TBody>[K];
} & {
  payload: StageSignalPayload<TStage, TBody>;
};

type RouteTokens = `${string}::${string}`;

const isSignalVerb = (value: string): value is SignalVerb =>
  value === 'emit' || value === 'relay' || value === 'drop' || value === 'mutate' || value === 'archive';

const nowTime = (): TimeMs => horizonBrand.fromTime(Date.now());

const routeFromVerb = <TStage extends PluginStage>(stage: TStage, verb: SignalVerb): RouteTokens =>
  `${stage}::${verb}` as RouteTokens;

const dedupeTrace = (trace: readonly string[]): readonly string[] => [...new Set(trace)];

const asIso = (timestamp: TimeMs): string => new Date(Number(timestamp)).toISOString();

export const makeSignalPayload = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  stage: TKind,
  verb: SignalVerb,
  body: TBody,
  trace: readonly string[] = [],
): StageSignalPayload<TKind, TBody> => ({
  kind: stage,
  verb,
  timestamp: nowTime(),
  body,
  trace: dedupeTrace([...trace, routeFromVerb(stage, verb)]),
});

export const makeSignalEnvelope = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  stage: TKind,
  verb: SignalVerb,
  body: TBody,
  trace: readonly string[] = [],
): SignalEnvelope<TKind, TBody> => ({
  id: `${stage}:${verb}:${Date.now()}`,
  stage,
  payload: makeSignalPayload(stage, verb, body, trace),
  generatedAt: asIso(nowTime()),
});

export const mergeSignals = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  left: readonly SignalEnvelope<TKind, TBody>[],
  right: readonly SignalEnvelope<TKind, TBody>[],
): readonly SignalEnvelope<TKind, TBody>[] => {
  const map = new Map<string, SignalEnvelope<TKind, TBody>>();
  for (const signal of [...left, ...right]) {
    map.set(signal.id, {
      ...signal,
      payload: {
        ...signal.payload,
        trace: dedupeTrace(signal.payload.trace),
      },
    });
  }
  return [...map.values()];
};

export const mutateSignal = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  signal: SignalEnvelope<TKind, TBody>,
  verb: string,
  mutation: Partial<TBody>,
): MutableSignal<TKind, TBody> => {
  if (!isSignalVerb(verb)) {
    throw new Error(`invalid verb ${verb}`);
  }

  return {
    ...signal,
    payload: {
      ...signal.payload,
      verb,
      body: {
        ...signal.payload.body,
        ...mutation,
      } as TBody,
      trace: dedupeTrace([...signal.payload.trace, `mutate:${signal.stage}:${verb}`]),
    },
  };
};

export const toHorizonSignal = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  tenantId: string,
  signal: SignalEnvelope<TKind, TBody>,
): HorizonSignal<TKind, TBody> => ({
  id: horizonBrand.fromPlanId(signal.id),
  kind: signal.stage,
  payload: signal.payload.body,
  input: {
    version: '1.0.0',
    runId: horizonBrand.fromRunId(signal.payload.kind),
    tenantId,
    stage: signal.stage,
    tags: signal.payload.trace,
    metadata: {
      route: signal.payload.trace as JsonLike,
      generatedAt: signal.generatedAt,
    },
  },
  severity: signal.payload.verb === 'drop' ? 'medium' : 'low',
  startedAt: horizonBrand.fromDate(signal.generatedAt),
});

export const createBucket = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  tenantId: string,
  stage: TKind,
  signals: readonly SignalEnvelope<TKind, TBody>[],
): SignalBucket<TKind, TBody> => ({
  tenantId,
  stage,
  history: signals.map((entry, index) => ({
    stage,
    before: entry.payload,
    after: makeSignalPayload(stage, index % 2 === 0 ? 'relay' : 'mutate', entry.payload.body, [...entry.payload.trace, `history:${index}`]),
    reason: `bucketed:${index}`,
  })),
  lastModified: nowTime(),
});

export const summarizeBuckets = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  buckets: readonly SignalBucket<TKind, TBody>[],
): Record<TKind, number> => {
  const out = {} as Record<TKind, number>;
  for (const bucket of buckets) {
    out[bucket.stage] = (out[bucket.stage] ?? 0) + bucket.history.length;
  }
  return out;
};

export const toRouteLabel = <T extends string>(route: T): `${T}:route` => `${route}:route`;
export const toSignalSummary = (envelope: SignalEnvelope<PluginStage, Record<string, JsonLike>>): string =>
  `${envelope.stage}=${envelope.payload.kind}/${envelope.payload.verb}/${envelope.payload.timestamp}`;
export const toMutationLabels = (bucket: SignalBucket<PluginStage, Record<string, JsonLike>>): readonly string[] =>
  bucket.history.map((mutation) => `${mutation.stage}:${mutation.reason}`);

export type SignalRecord = {
  readonly signal: SignalEnvelope;
  readonly route: RouteTokens;
};

export const buildSignalChannel = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  stage: TKind,
  signals: readonly SignalEnvelope<TKind, TBody>[],
): SignalChannel<TKind, TBody> => ({ stage, signals: [...signals] });

export const collectSignalBodies = <TKind extends PluginStage, TBody extends Record<string, JsonLike>>(
  channel: SignalChannel<TKind, TBody>,
): readonly TBody[] => channel.signals.map((signal) => signal.payload.body);
