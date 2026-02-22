import { withBrand } from '@shared/core';
import type { ReportPublisher, OperationsObservabilityOutput } from './types';
import type { OperationsAnalyticsReport } from '@data/recovery-operations-analytics';

export class InMemoryReportPublisher implements ReportPublisher {
  public readonly snapshots: OperationsAnalyticsReport[] = [];
  public readonly signals: string[] = [];
  public readonly errors: string[] = [];

  async publishRunSnapshot(input: OperationsAnalyticsReport): Promise<void> {
    this.snapshots.push(input);
  }

  async publishSignal(input: OperationsObservabilityOutput): Promise<void> {
    this.signals.push(`${input.runId}:${input.reports.length}`);
  }

  async publishError(tenant: string, error: unknown): Promise<void> {
    this.errors.push(`${tenant}:${String((error as Error)?.message ?? error)}`);
  }
}

export const buildSignals = <T>(tenant: string, payload: readonly T[]): string[] => {
  return payload.map((item, index) => `${tenant}:${index}:${String(item)}`);
};

export const signalId = <T>(tenant: string, payload: T): string => {
  return `${tenant}-${Date.now()}-${String(payload).slice(0, 24)}` as string;
};

export const describePublish = (tenant: string, snapshotCount: number): string => {
  return withBrand(`ops-observability:${tenant}:snapshots-${snapshotCount}`, 'OperationsObservabilityRunId');
};
