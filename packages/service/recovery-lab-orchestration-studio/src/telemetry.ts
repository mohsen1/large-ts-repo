import { createTimeline, toSummaryString } from '@shared/lab-simulation-kernel';
import type { NoInfer } from '@shared/type-level';

export interface TelemetryRecord {
  readonly id: string;
  readonly kind: string;
  readonly value: unknown;
}

export interface TelemetrySnapshot {
  readonly runId: string;
  readonly summary: string;
  readonly events: number;
  readonly createdAt: string;
}

export interface TelemetryCollector {
  push(record: TelemetryRecord): Promise<void> | void;
  summarize(runId: string): Promise<TelemetrySnapshot>;
}

export class InMemoryTelemetryCollector implements TelemetryCollector {
  readonly #records: TelemetryRecord[] = [];

  public async push(record: TelemetryRecord): Promise<void> {
    this.#records.push(record);
  }

  public async summarize(runId: string): Promise<TelemetrySnapshot> {
    const timeline = createTimeline(this.#records);
    const labels = timeline
      .map((entry) => ({
        ...entry,
        payload: `${entry.payload.id}:${entry.payload.kind}`,
      }))
      .toArray();

    return {
      runId,
      summary: toSummaryString(labels.map((entry) => entry.payload)),
      events: this.#records.length,
      createdAt: new Date().toISOString(),
    };
  }
}

export const normalizeTelemetry = <T extends readonly TelemetryRecord[]>(records: NoInfer<T>): TelemetryRecord[] => {
  return records
    .filter((record) => record.value !== undefined)
    .map((record) => ({ ...record, kind: record.kind.toUpperCase() }));
};
