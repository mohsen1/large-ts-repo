import type { JsonValue } from '@shared/type-level';
import type {
  AnalyticsSession,
  AnalyticsTenant,
  AnalyticsWindow,
  SignalNamespace,
} from '@domain/recovery-ecosystem-analytics';

export interface AnalyticsStoreSignalEvent<TKind extends string = string, TPayload = JsonValue> {
  readonly id: `event:${number}`;
  readonly kind: `signal:${TKind}`;
  readonly runId: `run:${string}`;
  readonly session: AnalyticsSession;
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly window: AnalyticsWindow;
  readonly payload: TPayload;
  readonly at: string;
}

export interface AnalyticsStoreStageRecord {
  readonly stage: `stage:${string}`;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'idle' | 'running' | 'done' | 'failed';
  readonly diagnostics: readonly string[];
}

export interface AnalyticsStoreRunRecord {
  readonly runId: `run:${string}`;
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly window: AnalyticsWindow;
  readonly session: AnalyticsSession;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'draft' | 'active' | 'complete' | 'error';
  readonly stages: readonly AnalyticsStoreStageRecord[];
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface StoreQueryOptions {
  readonly namespace?: SignalNamespace;
  readonly tenant?: AnalyticsTenant;
  readonly from?: string;
  readonly to?: string;
}

export interface StoreInsertResult {
  readonly inserted: boolean;
  readonly eventCount: number;
}

export interface AnalyticsStore {
  open(run: Pick<AnalyticsStoreRunRecord, 'runId' | 'tenant' | 'namespace' | 'window' | 'session'>): Promise<void>;
  close(runId: `run:${string}`): Promise<void>;
  append(event: AnalyticsStoreSignalEvent): Promise<StoreInsertResult>;
  appendStage(runId: `run:${string}`, stage: AnalyticsStoreStageRecord): Promise<void>;
  read(runId: `run:${string}`, signalKinds?: readonly string[]): Promise<readonly AnalyticsStoreSignalEvent[]>;
  queryRuns(options?: StoreQueryOptions): Promise<readonly AnalyticsStoreRunRecord[]>;
}
