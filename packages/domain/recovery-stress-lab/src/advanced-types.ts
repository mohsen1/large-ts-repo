import { type NoInfer } from '@shared/type-level';
import {
  type ForecastWindowId,
  type RecoverySignalId,
  type SeverityBand,
  type StageAttempt,
  type StageSignal,
  type StressPhase,
  type TenantId,
} from './models';

export type Brand<T extends string, TBrand extends string> = T & { readonly __brand: TBrand };
export type TenantScope<T extends string> = `tenant:${T}`;
export type SeverityLabel<T extends SeverityBand> = `${T}:severity`;
export type PhasePath<T extends string> = T extends `${infer Head}/${infer Tail}` ? readonly [Head, ...PhasePath<Tail>] : readonly [T];
export type Depth<T extends string> = PhasePath<T>['length'];
export type PrefixColumns<T extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof T as K extends string ? `${TPrefix}:${K}` : never]: T[K];
};
export type DeepTupleFlatten<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly unknown[]
    ? readonly [...DeepTupleFlatten<Head>, ...DeepTupleFlatten<Tail>]
    : readonly [Head, ...DeepTupleFlatten<Tail>]
  : readonly [];

export type Brandify<T, TBrand extends string> = Brand<string & T, TBrand>;
export type WindowCode = Brandify<string, 'ForecastWindowCode'>;
export type SignalDigest = Brandify<string, 'SignalDigest'>;

export interface StressLabSeed {
  readonly tenantId: TenantId;
  readonly namespace: string;
  readonly seedWindow: ForecastWindowId;
}

export type SignalIdToBucket<TSignal extends StageSignal = StageSignal> = {
  readonly [K in `${TSignal['signal']}:${TSignal['severity']}`]: TSignal;
};

export type PhaseTransition<TFrom extends string, TTo extends string> = `${TFrom}=>${TTo}`;

export type StageAttemptUnion<TSignals extends readonly StageSignal[]> =
  TSignals[number] extends infer TSignal
    ? TSignal extends StageSignal
      ? { readonly id: StageAttempt['id']; readonly signal: TSignal['signal']; readonly score: StageAttempt['normalizedScore'] }
      : never
    : never;

export type PluginRecordShape<TPlugins extends readonly string[]> = {
  readonly [K in TPlugins[number] as K extends string ? `plugin:${K}` : never]: K;
};

export type NoInferTuple<T> = [T][T extends any ? 0 : never];

export const normalizeTenant = (tenantId: TenantId): TenantId => {
  return `${tenantId}`.trim() as TenantId;
};

export const normalizeSignalId = (value: string): RecoverySignalId => {
  return `${value}`.trim() as RecoverySignalId;
};

export const buildStageTransition = (from: StressPhase, to: StressPhase): PhaseTransition<StressPhase, StressPhase> => {
  return `${from}=>${to}`;
};

export const createWindowCode = (tenantId: TenantId, window: ForecastWindowId): WindowCode => {
  return `${tenantId}:${window}`.replace(/\s+/g, '-') as WindowCode;
};

export const asSignalDigest = (value: string): SignalDigest => {
  return `digest:${value}`.toLowerCase().replaceAll(' ', '-') as SignalDigest;
};

export const toDepthLabel = (path: string): `${number}:${string}` => {
  const depth = path.split('/').filter(Boolean).length;
  return `${depth}:${path}` as `${number}:${string}`;
};

export const isHigherSeverity = (left: SeverityBand, right: SeverityBand): boolean => {
  const rank: Record<SeverityBand, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return rank[left] > rank[right];
};

export interface RankedSignal {
  readonly severity: SeverityBand;
  readonly confidence: number;
  readonly label: string;
}

export type RankedSignals<TSignals extends readonly StageSignal[]> = {
  readonly [K in TSignals[number] as K['signal'] & string]: {
    readonly bucket: `${K['signal']}:${K['severity']}`;
    readonly severity: K['severity'];
  };
};

export const rankSignals = <TSignals extends readonly StageSignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): RankedSignals<TSignals> => {
  const entries: Array<{
    signal: string;
    severity: SeverityBand;
    confidence: number;
  }> = [];

  for (const signal of signals) {
    const score = isHigherSeverity(signal.severity, 'medium') ? 1 : isHigherSeverity(signal.severity, 'low') ? 0.6 : 0.3;
    entries.push({
      signal: `${tenantId}:${signal.signal}`,
      severity: signal.severity,
      confidence: Math.min(1, score + (signal.score ?? 0)),
    });
  }

  const sorted = entries.toSorted((left, right) => right.confidence - left.confidence);
  const ranked = Object.fromEntries(sorted.map((entry) => [entry.signal, { bucket: `${entry.signal}:${entry.severity}`, severity: entry.severity }])) as RankedSignals<TSignals>;

  return ranked;
};

export const partitionByTenant = <T extends { readonly tenantId: TenantId; readonly signal: RecoverySignalId }>(
  inputs: readonly T[],
): PrefixColumns<Record<string, readonly T[]>, TenantScope<string>> => {
  const byTenant = new Map<string, T[]>();
  for (const input of inputs) {
    const tenantKey = `tenant:${input.tenantId}` as TenantScope<TenantId>;
    const bucket = byTenant.get(tenantKey) ?? [];
    bucket.push(input);
    byTenant.set(tenantKey, bucket);
  }

  return Object.fromEntries(
    [...byTenant.entries()].map(([tenantKey, bucket]) => [
      tenantKey,
      [...bucket],
    ]),
  ) as PrefixColumns<Record<string, readonly T[]>, TenantScope<string>>;
};

export const flattenSignals = <TSignals extends readonly unknown[]>(signals: NoInfer<TSignals>): DeepTupleFlatten<TSignals> => {
  const stack: unknown[][] = [Array.from(signals as readonly unknown[])];
  const flattened: unknown[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const value = current[index];
      if (Array.isArray(value)) {
        stack.push(value);
      } else {
        flattened.push(value);
      }
    }
  }
  return flattened.reverse() as unknown as DeepTupleFlatten<TSignals>;
};

export const assertNonEmpty = <T>(values: readonly T[]): [T, ...T[]] => {
  if (values.length === 0) {
    throw new Error('expected non-empty values');
  }
  return values as [T, ...T[]];
};

export const inferWindowSeed = (seed: StressLabSeed): `${string}:${string}` => {
  return `${seed.namespace}:${seed.seedWindow}`;
};

export const summarizeTenantDepth = (tenantId: TenantId): Depth<TenantScope<TenantId>> => {
  return toDepthLabel(`tenant/${tenantId}`).split(':')[0].length as Depth<TenantScope<TenantId>>;
};
