import type {
  Brand,
  JsonValue,
  KeyPaths,
  PathValue,
  Prettify,
} from '@shared/type-level';

export type NoInfer<T> = [T][T extends never ? 0 : 1];

export type HorizonEpoch = Brand<number, 'horizon-epoch'>;
export type HorizonTenant = Brand<string, 'horizon-tenant'>;
export type HorizonRunId = Brand<string, 'horizon-run-id'>;
export type HorizonPlanId = Brand<string, 'horizon-plan-id'>;
export type HorizonSessionId = Brand<string, 'horizon-session-id'>;
export type HorizonTraceId = Brand<string, 'horizon-trace-id'>;
export type HorizonStamp = Brand<number, 'horizon-stamp'>;
export type HorizonTag = Brand<string, 'horizon-tag'>;

export type EventKind = 'signal' | 'plan' | 'diagnostic' | 'control';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical' | 'info';

export type StageName = string;
export type Labelify<T extends string> = `${Uppercase<T>}_LABEL`;
export type StageLabel<T extends string> = `${Uppercase<T>}_STAGE`;
export type PluginLabel<T extends string> = `${Lowercase<T>}.${Uppercase<T>}`;
export type StageTupleLabel<T extends readonly StageName[]> = T[number] extends infer K
  ? K extends string
    ? StageLabel<K>
    : never
  : never;

export type BrandPair<T, B extends string> = Brand<T, `pair:${B}`>;

export type SplitRoute<T extends string, Delim extends string> =
  T extends `${infer Head}${Delim}${infer Tail}`
    ? readonly [Head, ...SplitRoute<Tail, Delim>]
    : readonly [T];

export type JoinRoute<T extends readonly string[], Delim extends string = '/'> =
  T extends readonly [infer Head, ...infer Rest]
    ? Head extends string
      ? Rest extends readonly string[]
        ? Rest extends []
          ? Head
          : `${Head}${Delim}${JoinRoute<Rest, Delim>}`
        : never
      : never
    : '';

export type CamelToKebab<T extends string> =
  T extends `${infer Head}${infer Rest}`
    ? Head extends Lowercase<Head>
      ? `${Lowercase<Head>}${CamelToKebab<Rest>}`
      : `-${Lowercase<Head>}${CamelToKebab<Rest>}`
    : T;

export type RenameKeys<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T & string as `${Prefix}${CamelToKebab<K>}`]: T[K];
};

export type RecursiveRequired<T> = {
  [K in keyof T]-?: NonNullable<RecursiveRequired<T[K]>>;
};

export type RecursiveOptional<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown>
    ? RecursiveOptional<T[K]>
    : T[K];
};

export type ExtractByStage<T> = T extends { readonly stage: infer Stage } ? Stage : never;

export interface HorizonEnvelope {
  readonly traceId: HorizonTraceId;
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly version: `v${number}.${number}`;
  readonly stage: StageName;
  readonly tags: readonly HorizonTag[];
  readonly severity: SeverityLevel;
  readonly eventKind: EventKind;
  readonly metadata: Record<string, JsonValue>;
}

export type TimelineNode<TKind extends string, TPayload> = Readonly<{
  readonly kind: StageLabel<TKind>;
  readonly stage: TKind;
  readonly startedAt: HorizonEpoch;
  readonly payload: TPayload;
}>;

export interface HorizonEvent<TKind extends string = string, TPayload = JsonValue> extends HorizonEnvelope {
  readonly kind: StageLabel<TKind>;
  readonly payload: TPayload;
}

export interface HorizonEventEnvelope<TPayload = JsonValue> {
  readonly stamp: HorizonStamp;
  readonly payload: TPayload;
  readonly envelope: HorizonEnvelope;
}

export type EventByStage<T extends readonly StageName[], TPayload = JsonValue> = {
  [Index in keyof T & number]: T[Index] extends StageName
    ? HorizonEvent<T[Index], TPayload>
    : never;
};

export type TimelineSummary<T extends readonly HorizonEvent[]> = Readonly<{
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly total: number;
  readonly events: T;
}>;

export type KeyedByEventKind<TEvents extends readonly HorizonEvent[]> = {
  [K in TEvents[number] as K['kind']]: K[];
};

export type ExtractEventPayload<TEvent> = TEvent extends HorizonEvent<infer _, infer Payload>
  ? Payload
  : never;

export type MutableTimeline<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Rest]
    ? [Head, ...MutableTimeline<Rest>]
    : [];

export type TimelineAccumulator<T extends readonly HorizonEvent[]> = {
  readonly [Index in keyof T]:
    T[Index] extends infer Entry
      ? Entry extends HorizonEvent
        ? Readonly<{ readonly index: Index; readonly entry: Entry }>
        : never
      : never;
};

export type StageFold<T extends readonly HorizonEvent[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends HorizonEvent
    ? {
        readonly head: Head;
        readonly tail: Tail extends readonly HorizonEvent[] ? StageFold<Tail> : never;
      }
    : never
  : null;

export type RoutePaths<T> = T extends Record<string, unknown> ? KeyPaths<T> : never;
export type RouteValue<T, TRoute extends KeyPaths<T>> = TRoute extends string
  ? PathValue<T, TRoute>
  : never;

export type EventFilter<T extends readonly HorizonEvent[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends HorizonEvent
      ? {
          readonly kept: Head[];
          readonly rest: Tail extends readonly HorizonEvent[] ? EventFilter<Tail> : never;
        }
      : never
    : { kept: []; rest: null };

export type AsyncResult<T> = PromiseLike<T> | T;

export interface SessionInput<TStage extends StageName = StageName> {
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly stageWindow: readonly TStage[];
  readonly seed: JsonValue;
}

export interface EventEnvelopeInput {
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly stage: StageName;
  readonly payload: JsonValue;
}

export const standardEventKinds = ['signal', 'plan', 'diagnostic', 'control'] as const;
export const standardSeverityLevels = ['low', 'medium', 'high', 'critical', 'info'] as const;
export const standardEventStates = ['new', 'inflight', 'resolved', 'acked'] as const;

export const eventKindList = [...standardEventKinds] satisfies readonly EventKind[];
export const severityList = [...standardSeverityLevels] satisfies readonly SeverityLevel[];
export const defaultSessionWindow = ['ingest', 'analyze', 'resolve'] as const satisfies readonly StageName[];
export const timelinePlaceholder: readonly HorizonEnvelope[] = [];

export const normalizeTag = (candidate: string): HorizonTag => (`tag:${candidate}` as HorizonTag);

export type TimelineSummaryMap<T extends readonly StageName[]> = {
  [K in T[number]]: number;
};

export const toTimelineNode = <
  const TKind extends string,
  TPayload,
  const TStartedAt extends HorizonEpoch,
>(
  kind: TKind,
  startedAt: TStartedAt,
  payload: TPayload,
): TimelineNode<TKind, TPayload> => ({
  kind: `${String(kind).toUpperCase()}_STAGE` as StageLabel<TKind>,
  stage: kind,
  startedAt,
  payload,
}) satisfies TimelineNode<TKind, TPayload>;

export type EnvelopeLike<TPayload> = {
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly kind: StageLabel<string>;
  readonly payload: TPayload;
};

export type PipelineMeta<TKind extends string, TPayload> = {
  readonly id: `${TKind}::${string}`;
  readonly kind: TKind;
  readonly traceId: HorizonTraceId;
  readonly startedAt: HorizonEpoch;
  readonly payload: TPayload;
};

export type PipelineEnvelope<TKind extends string, TPayload> = Prettify<{
  readonly tenant: HorizonTenant;
  readonly kind: StageLabel<TKind>;
  readonly metadata: Record<string, JsonValue>;
  readonly payload: TPayload;
}>;
