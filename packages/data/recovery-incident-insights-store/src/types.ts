import type {
  ForecastWindow,
  IncidentForecast,
  IncidentSignal,
  IncidentSignalId,
  IncidentId,
  TenantId,
  RunId,
  SignalBundle,
} from '@domain/recovery-incident-insights/src';

export interface IncidentSnapshot {
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly signalCount: number;
  readonly lastSignalAt: string;
}

export interface SignalStoreRecord {
  readonly signalId: IncidentSignalId;
  readonly tenantId: TenantId;
  readonly signal: IncidentSignal;
  readonly indexedAt: string;
}

export interface ForecastStoreRecord {
  readonly tenantId: TenantId;
  readonly forecastId: IncidentForecast['forecastId'];
  readonly forecast: IncidentForecast;
  readonly runWindow: ForecastWindow;
  readonly createdAt: string;
}

export interface BundleStoreRecord {
  readonly tenantId: TenantId;
  readonly bundleId: SignalBundle['bundleId'];
  readonly bundle: SignalBundle;
  readonly createdAt: string;
}

export interface StoreQuery {
  readonly tenantId?: TenantId;
  readonly incidentId?: IncidentId;
  readonly runId?: RunId;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface RunExecution {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly status: 'queued' | 'running' | 'complete' | 'failed';
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly steps: ReadonlyArray<string>;
}
