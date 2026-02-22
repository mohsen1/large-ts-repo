import { ok, fail, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type {
  AnalyticsAdapter,
  OperationsAnalyticsReport,
  MetricEnvelope,
} from './types';
import { buildSnapshotEnvelope } from './summaries';
import { parseMetricWindow } from './aggregation';

interface InMemorySnapshotStore {
  readonly report: OperationsAnalyticsReport[];
  readonly snapshots: MetricEnvelope<unknown>[];
}

export interface RepositoryLike {
  save(report: OperationsAnalyticsReport): Promise<void>;
  saveSnapshot<T>(snapshot: MetricEnvelope<T>): Promise<void>;
}

class InternalMemoryRepo {
  private readonly state: InMemorySnapshotStore = {
    report: [],
    snapshots: [],
  };

  async save(report: OperationsAnalyticsReport): Promise<void> {
    this.state.report.push(report);
  }

  async saveSnapshot<T>(snapshot: MetricEnvelope<T>): Promise<void> {
    this.state.snapshots.push(snapshot);
  }
}

export class InMemoryAnalyticsAdapter implements AnalyticsAdapter {
  private readonly repository: RepositoryLike;

  constructor(repository: RepositoryLike = new InternalMemoryRepo()) {
    this.repository = repository;
  }

  async publishReport(report: OperationsAnalyticsReport): Promise<void> {
    await this.repository.save(report);
  }

  async publishSnapshot<T>(snapshot: MetricEnvelope<T>): Promise<void> {
    await this.repository.saveSnapshot(snapshot);
  }
}

export class TelemetryBridgeAdapter implements AnalyticsAdapter {
  async publishReport(report: OperationsAnalyticsReport): Promise<void> {
    const context = parseMetricWindow(report.window);
    const envelope = buildSnapshotEnvelope(report.tenant, 'operations.telemetry', report.signalDensity, context);
    await Promise.resolve({ tenant: envelope.tenant, metric: envelope.metric, signalDensity: envelope.payload.length });
  }

  async publishSnapshot<T>(snapshot: MetricEnvelope<T>): Promise<void> {
    const metric = withBrand(snapshot.metric, 'MetricName');
    await Promise.resolve({ metric, tenant: snapshot.tenant, at: snapshot.generatedAt });
  }
}

export interface SafeTelemetrySink {
  publish<T>(input: MetricEnvelope<T>): Result<void, string>;
}

export const safePublish = async <T>(
  input: MetricEnvelope<T>,
  adapter: AnalyticsAdapter,
): Promise<Result<void, string>> => {
  try {
    await adapter.publishSnapshot(input);
    return ok(undefined);
  } catch (error) {
    return fail((error as Error).message ?? 'UNKNOWN_ADAPTER_FAILURE');
  }
};

export const toMetricEnvelope = <T>(tenant: string, metric: string, payload: T): Result<MetricEnvelope<T>, string> => {
  try {
    const context = parseMetricWindow({
      from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
      zone: 'UTC',
      kind: 'hour',
    });

    return ok(buildSnapshotEnvelope(tenant, metric, payload, context));
  } catch (error) {
    return fail((error as Error).message ?? 'METRIC_ENVELOPE_BUILD_FAILED');
  }
};

export const createAdapterChain = (adapters: readonly AnalyticsAdapter[]): AnalyticsAdapter => ({
  publishReport: async (report) => {
    await Promise.all(adapters.map((adapter) => adapter.publishReport(report)));
  },
  publishSnapshot: async <T>(snapshot: MetricEnvelope<T>) => {
    await Promise.all(adapters.map((adapter) => adapter.publishSnapshot(snapshot)));
  },
});
