type Brand<T, B extends string> = T & { readonly __brand: B };

type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

type DeepMerge<A, B> = Omit<A, keyof B> & B;

type PathValue<T, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? T[Head] extends Record<string, unknown>
      ? PathValue<T[Head], Tail>
      : never
    : never
  : TPath extends keyof T
    ? T[TPath]
    : never;

export type UnionToIntersection<T> =
  (T extends unknown ? (k: T) => void : never) extends (k: infer I) => void ? I : never;

export type SignalDimension = 'infrastructure' | 'security' | 'traffic' | 'data-plane' | 'control-plane';
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SignalUrgency = 'normal' | 'elevated' | 'urgent';
export type ReadinessState = 'healthy' | 'unstable' | 'degraded' | 'critical';

export type IncidentSignalId = Brand<string, 'IncidentSignalId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type RunId = Brand<string, 'RecoveryRunId'>;
export type TenantId = Brand<string, 'TenantId'>;

export interface IncidentSignal {
  readonly signalId: IncidentSignalId;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly dimension: SignalDimension;
  readonly severity: SignalSeverity;
  readonly urgency: SignalUrgency;
  readonly source: string;
  readonly createdAt: string;
  readonly confidence: number;
  readonly tags: readonly string[];
  readonly payload: Record<string, unknown>;
}

export interface SignalVector {
  readonly dimension: SignalDimension;
  readonly score: number;
  readonly normalizedScore: number;
  readonly evidenceCount: number;
}

export interface SignalWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly signals: readonly IncidentSignal[];
}

export interface SignalBundle {
  readonly bundleId: Brand<string, 'SignalBundleId'>;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly generatedAt: string;
  readonly window: SignalWindow;
  readonly vectors: readonly SignalVector[];
  readonly metadata: {
    readonly sourceSystems: readonly string[];
    readonly sampleRateSeconds: number;
    readonly algorithm: string;
  };
}

export interface IncidentReadiness {
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly state: ReadinessState;
  readonly score: number;
  readonly confidence: number;
  readonly observedUntil: string;
  readonly contributingSignals: readonly IncidentSignalId[];
}

export interface ActionCandidate {
  readonly actionId: Brand<string, 'ActionId'>;
  readonly label: string;
  readonly weight: number;
  readonly rationale: string;
  readonly prerequisites: readonly Brand<string, 'Prereq'>[];
}

export interface RecoveryPlay {
  readonly playId: Brand<string, 'RecoveryPlayId'>;
  readonly name: string;
  readonly urgency: SignalUrgency;
  readonly candidates: readonly ActionCandidate[];
  readonly expectedRecoveryMinutes: number;
  readonly blastRadius: 'low' | 'medium' | 'high';
}

export interface ForecastWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly recoveryMinutesEstimate: number;
  readonly confidence: number;
  readonly planId: Brand<string, 'ForecastPlanId'>;
}

export interface IncidentForecast {
  readonly forecastId: Brand<string, 'IncidentForecastId'>;
  readonly tenantId: TenantId;
  readonly bundleId: SignalBundle['bundleId'];
  readonly forecastWindow: ForecastWindow;
  readonly readiness: IncidentReadiness;
  readonly recommendations: readonly RecoveryPlay[];
  readonly riskProfile: {
    readonly volatility: number;
    readonly concentration: number;
    readonly dependencyRisk: number;
  };
  readonly createdAt: string;
}

export interface InsighsEnvelope<Payload> {
  readonly issueId: Brand<string, 'IssueId'>;
  readonly tenantId: TenantId;
  readonly payload: Payload;
  readonly generatedAt: string;
  readonly ttlMinutes: number;
}

export interface ForecastRunReport {
  readonly reportId: Brand<string, 'ReportId'>;
  readonly forecastId: IncidentForecast['forecastId'];
  readonly runId: RunId;
  readonly readiness: IncidentReadiness;
  readonly actionsSelected: readonly ActionCandidate['actionId'][];
  readonly executionPlan: readonly RecoveryPlay['playId'][];
  readonly notes: readonly string[];
}

export type SeverityWeights = Record<SignalDimension, number>;
export type ReadinessFactors = Readonly<Record<keyof IncidentReadiness, number>>;
export type NumericRecord<T extends Record<string, number>> = {
  [K in keyof T]: T[K];
};

export type ForecastContext<T extends Record<string, unknown> = Record<string, unknown>> = DeepReadonly<{
  readonly bundle: SignalBundle;
  readonly forecast: Omit<IncidentForecast, 'forecastId' | 'createdAt'>;
  readonly meta: T;
}>;

export type MergeReadiness = DeepMerge<ReadinessFactors, { readonly computedAt: string }>;

export type SignalBy<TPath extends string> = PathValue<SignalBundle, TPath>;

export type ReadinessStateModel = {
  readonly [D in SignalDimension]: SignalSeverity;
};

export type SignalUnion = IncidentSignal | SignalWindow | SignalBundle;
export type SignalShape<T> = T extends string ? { readonly kind: 'string' } : T extends number ? { readonly kind: 'number' } : { readonly kind: 'object' };

export type PolicyCheck<T> = UnionToIntersection<T>;

export interface PolicyRule<Input, Output> {
  readonly code: Brand<string, 'PolicyCode'>;
  readonly description: string;
  readonly match: (input: Input) => boolean;
  readonly apply: (input: Input) => Output;
}
