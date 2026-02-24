export type Brand<TValue, TMarker extends string> = TValue & {
  readonly __brand: TMarker;
};

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type IncidentSeverity = 'critical' | 'high' | 'moderate' | 'low';
export type IncidentChannel = 'telemetry' | 'scheduler' | 'manual' | 'agent';
export type IncidentCategory = `${IncidentChannel}:${string}`;
export type EventType = `${IncidentSeverity}-${IncidentChannel}`;

export type TenantId = Brand<string, 'TenantId'>;
export type RunPlanId = Brand<string, 'RunPlanId'>;
export type PluginRunId = Brand<string, 'PluginRunId'>;
export type SignalId = Brand<string, 'SignalId'>;
export type RuntimeChecksum = Brand<string, 'RuntimeChecksum'>;

export const toTenantId = (value: string): TenantId => value as TenantId;
export const toRunPlanId = (value: string): RunPlanId => value as RunPlanId;
export const toPluginRunId = (value: string): PluginRunId => value as PluginRunId;
export const toSignalId = (value: string): SignalId => value as SignalId;
export const toRuntimeChecksum = (value: string): RuntimeChecksum => value as RuntimeChecksum;

export type PrependTuple<TItem, TTuple extends readonly unknown[]> = readonly [TItem, ...TTuple];
export type AppendTuple<TTuple extends readonly unknown[], TItem> = readonly [...TTuple, TItem];
export type Tail<TTuple extends readonly unknown[]> = TTuple extends readonly [unknown, ...infer Rest]
  ? Rest
  : readonly [];
export type Head<TTuple extends readonly unknown[]> = TTuple extends readonly [infer THead, ...unknown[]]
  ? THead
  : never;

export type IsNever<T> = [T] extends [never] ? true : false;
export type AssertFiniteTuple<TTuple extends readonly unknown[]> = TTuple['length'] extends number ? true : false;

export type ReverseTuple<TTuple extends readonly unknown[]> = TTuple extends readonly [infer Head, ...infer Tail]
  ? [...ReverseTuple<Tail & readonly unknown[]>, Head]
  : readonly [];

export type ZipTuple<TLeft extends readonly unknown[], TRight extends readonly unknown[]> = TLeft extends readonly [infer LeftHead, ...infer LeftTail]
  ? TRight extends readonly [infer RightHead, ...infer RightTail]
    ? readonly [[LeftHead, RightHead], ...ZipTuple<LeftTail & readonly unknown[], RightTail & readonly unknown[]>]
    : readonly []
  : readonly [];

export type FlattenTuples<TTuple extends readonly unknown[]> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly unknown[]
    ? [...FlattenTuples<Head>, ...FlattenTuples<Tail & readonly unknown[]>]
    : [Head, ...FlattenTuples<Tail & readonly unknown[]>]
  : readonly [];

export type DistinctFromTuple<TTuple extends readonly string[], TItem extends string> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? [Head] extends [TItem]
      ? DistinctFromTuple<Tail & readonly string[], TItem>
      : readonly [Head, ...DistinctFromTuple<Tail & readonly string[], TItem>]
    : readonly []
  : readonly [];

export type DistinctTuple<TTuple extends readonly string[]> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? readonly [Head, ...ExcludeFromTuple<Tail & readonly string[], Head>]
    : readonly []
  : readonly [];

type ExcludeFromTuple<TTuple extends readonly string[], TItem extends string> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? [Head] extends [TItem]
      ? ExcludeFromTuple<Tail & readonly string[], TItem>
      : readonly [Head, ...ExcludeFromTuple<Tail & readonly string[], TItem>]
    : readonly []
  : readonly [];

export type RenameBySuffix<TObject extends Record<string, unknown>, TSuffix extends string> = {
  [Key in keyof TObject as Key extends string ? `${Key}${TSuffix}` : never]: TObject[Key];
};

export type RenameByPrefix<TObject extends Record<string, unknown>, TPrefix extends string> = {
  [Key in keyof TObject as Key extends string ? `${TPrefix}${Key}` : never]: TObject[Key];
};

export type ConditionalMap<TMap extends Record<string, unknown>> = {
  [Key in keyof TMap]: TMap[Key] extends string
    ? Brand<string, `String:${Extract<Key, string>}`>
    : TMap[Key] extends number
      ? Brand<number, `Number:${Extract<Key, string>}`>
      : TMap[Key];
};

export type TemplateRoute<TParts extends readonly string[], TBase extends string = ''> = TParts extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends string
    ? `${TBase}${TBase extends '' ? '' : '.'}${Head}` | TemplateRoute<Tail & readonly string[], `${TBase}${TBase extends '' ? '' : '.'}${Head}`>
    : never
  : TBase;

export type MergeObjects<TLeft extends Record<string, unknown>, TRight extends Record<string, unknown>> = Omit<TLeft, keyof TRight> & TRight;

export type Expand<TValue> = TValue extends infer Value ? { readonly [Key in keyof Value]: Value[Key] } : never;

export interface TemporalWindow {
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
}

export interface RecoverySignal {
  readonly id: SignalId;
  readonly incident: Brand<string, 'IncidentId'>;
  readonly tenant: TenantId;
  readonly category: IncidentCategory;
  readonly severity: IncidentSeverity;
  readonly channel: IncidentChannel;
  readonly source: string;
  readonly value: number;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

const defaultSeverityWeights = {
  critical: 1.0,
  high: 0.75,
  moderate: 0.35,
  low: 0.05,
} as const satisfies Record<IncidentSeverity, number>;

export const severityWeightLookup = (severity: IncidentSeverity): number =>
  defaultSeverityWeights[severity] ?? 0.0;

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const normalizeScore = (value: number): number => clamp01(Number(value.toFixed(4)));

export const asReadonlyTuple = <TValue extends readonly unknown[]>(value: TValue): TValue => value;

export const tupleWindow = <TValue extends readonly unknown[]>(start: TValue, end: TValue): readonly [TValue, TValue] => [start, end];

export const makeTemporalWindow = (at = new Date(), ttlMinutes = 120): TemporalWindow => ({
  from: at.toISOString(),
  to: new Date(at.getTime() + ttlMinutes * 60 * 1000).toISOString(),
  timezone: 'UTC',
});

export const toMap = <TItem, TKey extends string>(items: readonly TItem[], key: (item: TItem) => TKey): Map<TKey, TItem> =>
  items.reduce((acc, item) => {
    acc.set(key(item), item);
    return acc;
  }, new Map<TKey, TItem>());

export const bySeverity = (signals: readonly RecoverySignal[]): Partial<Record<IncidentSeverity, RecoverySignal[]>> =>
  signals.reduce(
    (acc, signal) => {
      const next = { ...acc };
      const bucket = next[signal.severity] ?? [];
      bucket.push(signal);
      next[signal.severity] = bucket;
      return next;
    },
    { critical: [], high: [], moderate: [], low: [] } as Record<IncidentSeverity, RecoverySignal[]>,
  );

export const scoreSignalFingerprint = (
  signals: readonly RecoverySignal[],
): `${IncidentSeverity}-${number}` => {
  const summary = signals.reduce<Record<IncidentSeverity, number>>((acc, signal) => {
    acc[signal.severity] = (acc[signal.severity] ?? 0) + 1;
    return acc;
  }, { critical: 0, high: 0, moderate: 0, low: 0 });
  const top = (['critical', 'high', 'moderate', 'low'] as const).find((severity) => summary[severity] > 0) ?? 'low';
  const count = summary[top];
  return `${top}-${count}` as const;
};
