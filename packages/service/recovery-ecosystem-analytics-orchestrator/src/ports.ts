import type { JsonValue, NoInfer } from '@shared/type-level';
import type { Result } from '@shared/result';
import type { AnalyticsStore, AnalyticsStoreSignalEvent, StoreQueryOptions, AnalyticsStoreRunRecord } from '@data/recovery-ecosystem-analytics-store';
import type {
  AnalyticsPlanRecord,
  ScenarioMetrics,
  AnalyticsSignalPayload,
  SignalNamespace,
  AnalyticsTenant,
  AnalyticsRun,
  AnalyticsWindow,
} from '@domain/recovery-ecosystem-analytics';
import { asNamespace, asTenant, asRun } from '@domain/recovery-ecosystem-analytics';

export interface OrchestratorOptions {
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly window: AnalyticsWindow;
}

export interface OrchestratorDependencies {
  readonly store: AnalyticsStore;
}

export interface AnalyzeRequest<TSignals extends readonly string[] = readonly string[]> {
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly signals: readonly {
    readonly kind: TSignals[number];
    readonly payload: JsonValue;
  }[];
}

export type AnalyzeResult = {
  readonly runId: AnalyticsRun;
  readonly summary: ScenarioMetrics;
  readonly eventCount: number;
  readonly fingerprint: `fingerprint:${string}`;
};

export interface OrchestratorFacade {
  startScenario(input: AnalyzeRequest): Promise<Result<AnalyzeResult>>;
  evaluateTopology(plan: AnalyticsPlanRecord): Promise<Result<ScenarioMetrics>>;
  hydrateRuns(tenant: AnalyticsTenant): Promise<readonly AnalyticsStoreRunRecord[]>;
}

export interface SignalTimelineEvent {
  readonly kind: `signal:${string}`;
  readonly payload: JsonValue;
}

export interface SignalEmitter {
  emit(event: SignalTimelineEvent, runId: AnalyticsRun): Promise<AnalyticsStoreSignalEvent>;
}

export interface OrchestratorFactoryConfig {
  readonly dependencies?: Partial<NoInfer<OrchestratorDependencies>>;
  readonly options?: Partial<NoInfer<OrchestratorOptions>>;
}

export interface RunQueryOptions extends StoreQueryOptions {
  readonly includeEvents?: boolean;
}

export const toSignalPayload = <const TKind extends string>(
  kind: TKind,
  payload: JsonValue,
  runId: AnalyticsRun,
  namespace: SignalNamespace,
): AnalyticsSignalPayload<TKind> => ({
  kind: `signal:${kind}` as `signal:${TKind}`,
  runId,
  namespace,
  at: new Date().toISOString(),
  payload,
});

export const normalizeTenant = (tenant: string): AnalyticsTenant => asTenant(tenant.replace(/^tenant:/, ''));
export const normalizeNamespace = (namespace: string): SignalNamespace => asNamespace(namespace.replace(/^namespace:/, ''));
export const normalizeRunId = (runId: string): AnalyticsRun => asRun(runId);
