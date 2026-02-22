import type { DeepReadonly } from '@shared/type-level';

export type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

export type IsoDate = `${number}-${number}-${number}T${number}:${number}:${number}Z`;

export type Brand<T, TBrand> = T & { readonly __brand: TBrand };

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type PriorityBucket = 'low' | 'medium' | 'high' | 'critical';
export type SignalCategory = 'availability' | 'latency' | 'dataQuality' | 'compliance';

export interface RecoveryEntityRef {
  readonly tenantId: Brand<string, 'tenant-id'>;
  readonly entityId: Brand<string, 'entity-id'>;
}

export interface RecoverySignal<TContext extends object = object> {
  readonly signalId: Brand<string, 'signal-id'>;
  readonly tenantId: Brand<string, 'tenant-id'>;
  readonly source: string;
  readonly category: SignalCategory;
  readonly severity: number;
  readonly observedAt: IsoDate;
  readonly ttlAt: IsoDate;
  readonly fingerprint: Brand<string, 'fingerprint'>;
  readonly attributes: DeepReadonly<TContext>;
}

export interface RecoveryContextSnapshot<TContext extends object = object> {
  readonly tenantId: Brand<string, 'tenant-id'>;
  readonly runId: Brand<string, 'run-id'>;
  readonly serviceName: string;
  readonly zone: string;
  readonly startedAt: IsoDate;
  readonly metadata: DeepReadonly<TContext>;
}

export interface RecoverySignalBundle<TContext extends object = object, TPolicy extends object = object> {
  readonly bundleId: Brand<string, 'bundle-id'>;
  readonly context: RecoveryContextSnapshot<TContext>;
  readonly signals: readonly RecoverySignal<TContext>[];
  readonly policy: DeepReadonly<TPolicy>;
  readonly expectedRecoveryMinutes: number;
}

export interface RecoveryActionCandidate {
  readonly actionId: Brand<string, 'action-id'>;
  readonly targetService: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly prerequisites: readonly Brand<string, 'action-prerequisite'>[];
  readonly rollbackMinutes: number;
}

export interface RecoveryRecommendation {
  readonly recommendationId: Brand<string, 'recommendation-id'>;
  readonly score: number;
  readonly bucket: PriorityBucket;
  readonly rationale: string;
  readonly actions: readonly RecoveryActionCandidate[];
  readonly predictedRiskReduction: number;
}

export interface RecoveryForecast<TContext extends object = object> {
  readonly forecastId: Brand<string, 'forecast-id'>;
  readonly context: RecoveryContextSnapshot<TContext>;
  readonly signalDensity: number;
  readonly meanRecoveryMinutes: number;
  readonly confidence: number;
  readonly confidenceBySignal: Readonly<Record<SignalCategory, number>>;
}
