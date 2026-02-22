import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  IncidentForecast,
  SignalBundle,
  IncidentSignal,
  IncidentSignalId,
} from '@domain/recovery-incident-insights/src';
import type { ForecastStoreRecord, StoreQuery, SignalStoreRecord, BundleStoreRecord, RunExecution, IncidentSnapshot } from './types';
import { validateStoreQuery } from './queries';

export interface RecoveryIncidentInsightsStoreRepository {
  appendSignal(signal: IncidentSignal): Promise<Result<IncidentSignalId, Error>>;
  appendBundle(bundle: SignalBundle): Promise<Result<string, Error>>;
  saveForecast(forecast: IncidentForecast): Promise<Result<string, Error>>;
  saveRunExecution(execution: RunExecution): Promise<Result<string, Error>>;
  findSignals(query: StoreQuery): Promise<readonly SignalStoreRecord[]>;
  findBundles(query: StoreQuery): Promise<readonly BundleStoreRecord[]>;
  findForecasts(query: StoreQuery): Promise<readonly ForecastStoreRecord[]>;
  findRunExecutions(query: StoreQuery): Promise<readonly RunExecution[]>;
  snapshot(query: StoreQuery): Promise<IncidentSnapshot | undefined>;
}

export class InMemoryRecoveryIncidentInsightsStore implements RecoveryIncidentInsightsStoreRepository {
  private readonly signalStore = new Map<string, SignalStoreRecord>();
  private readonly bundleStore = new Map<string, BundleStoreRecord>();
  private readonly forecastStore = new Map<string, ForecastStoreRecord>();
  private readonly runStore = new Map<string, RunExecution>();

  async appendSignal(signal: IncidentSignal): Promise<Result<IncidentSignalId, Error>> {
    if (!signal.signalId || signal.createdAt.length < 1) {
      return fail(new Error('signal-invalid'));
    }
    const record: SignalStoreRecord = {
      signalId: signal.signalId,
      tenantId: signal.tenantId,
      signal,
      indexedAt: new Date().toISOString(),
    };
    this.signalStore.set(signal.signalId, record);
    return ok(signal.signalId);
  }

  async appendBundle(bundle: SignalBundle): Promise<Result<string, Error>> {
    const record: BundleStoreRecord = {
      tenantId: bundle.tenantId,
      bundleId: bundle.bundleId,
      bundle,
      createdAt: new Date().toISOString(),
    };
    this.bundleStore.set(bundle.bundleId, record);
    return ok(bundle.bundleId);
  }

  async saveForecast(forecast: IncidentForecast): Promise<Result<string, Error>> {
    const record: ForecastStoreRecord = {
      tenantId: forecast.tenantId,
      forecastId: forecast.forecastId,
      forecast,
      runWindow: forecast.forecastWindow,
      createdAt: forecast.createdAt,
    };
    this.forecastStore.set(forecast.forecastId, record);
    return ok(forecast.forecastId);
  }

  async saveRunExecution(execution: RunExecution): Promise<Result<string, Error>> {
    if (!execution.runId) return fail(new Error('run-execution-invalid'));
    this.runStore.set(execution.runId, execution);
    return ok(execution.runId);
  }

  async findSignals(query: StoreQuery): Promise<readonly SignalStoreRecord[]> {
    const normalized = validateStoreQuery(query);
    if (!normalized.ok) return [];
    const values = Array.from(this.signalStore.values())
      .filter((record) => (normalized.value.tenantId ? record.tenantId === normalized.value.tenantId : true))
      .filter((record) => (normalized.value.incidentId ? record.signal.incidentId === normalized.value.incidentId : true))
      .filter((record) => {
        if (!normalized.value.from && !normalized.value.to) return true;
        const created = record.signal.createdAt;
        if (normalized.value.from && created < normalized.value.from) return false;
        if (normalized.value.to && created > normalized.value.to) return false;
        return true;
      });

    const sorted = values
      .slice()
      .sort((left, right) => right.indexedAt.localeCompare(left.indexedAt));
    return sorted.slice(0, normalized.value.limit);
  }

  async findBundles(query: StoreQuery): Promise<readonly BundleStoreRecord[]> {
    const normalized = validateStoreQuery(query);
    if (!normalized.ok) return [];
    return Array.from(this.bundleStore.values())
      .filter((record) => (normalized.value.tenantId ? record.tenantId === normalized.value.tenantId : true))
      .filter((record) => (normalized.value.incidentId ? record.bundle.incidentId === normalized.value.incidentId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, normalized.value.limit);
  }

  async findForecasts(query: StoreQuery): Promise<readonly ForecastStoreRecord[]> {
    const normalized = validateStoreQuery(query);
    if (!normalized.ok) return [];
    return Array.from(this.forecastStore.values())
      .filter((record) => (normalized.value.tenantId ? record.tenantId === normalized.value.tenantId : true))
      .filter((record) => (normalized.value.incidentId ? record.forecast.incidentId === normalized.value.incidentId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, normalized.value.limit);
  }

  async findRunExecutions(query: StoreQuery): Promise<readonly RunExecution[]> {
    const normalized = validateStoreQuery(query);
    if (!normalized.ok) return [];
    return Array.from(this.runStore.values())
      .filter((record) => (normalized.value.tenantId ? record.tenantId === normalized.value.tenantId : true))
      .filter((record) => (normalized.value.incidentId ? record.incidentId === normalized.value.incidentId : true))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, normalized.value.limit);
  }

  async snapshot(query: StoreQuery): Promise<IncidentSnapshot | undefined> {
    const normalized = validateStoreQuery(query);
    if (!normalized.ok) return undefined;
    const records = await this.findSignals({
      tenantId: normalized.value.tenantId,
      incidentId: normalized.value.incidentId,
      limit: normalized.value.limit,
    });
    if (records.length === 0) return undefined;
    const signal = records[0];
    return {
      tenantId: signal.tenantId,
      incidentId: signal.signal.incidentId,
      signalCount: records.length,
      lastSignalAt: signal.signal.createdAt,
    };
  }
}
