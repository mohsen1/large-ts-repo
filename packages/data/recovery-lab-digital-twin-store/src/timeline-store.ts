import type { TwinSnapshot, TwinId, DigitalTwinRecord } from './types';
import { createTimeline, TimelineIterator } from '@shared/lab-simulation-kernel';
import type { SignalWindow, SignalPayload } from '@domain/recovery-lab-signal-studio';

export interface TimelineWindowFilter {
  readonly minFrom: number;
  readonly maxTo: number;
  readonly includeEmpty?: boolean;
}

export interface TimelineStoreRow {
  readonly runId: string;
  readonly windows: readonly SignalWindow[];
}

const emptyPayload = (): SignalPayload => ({ __brand: 'SignalPayload', ...({} as Record<string, unknown>) }) as SignalPayload;

export const buildSnapshot = (record: DigitalTwinRecord, windows: readonly SignalWindow[]): TwinSnapshot => {
  const timeline = createTimeline(windows).map((entry) => ({
    ...entry,
    payload: {
      timestamp: entry.timestamp.toISOString(),
      index: entry.index,
      source: record.runId,
    },
  }));

  return {
    record,
    windows,
    payload: emptyPayload(),
    timeline: timeline.toArray(),
  };
};

export class WindowTimeline {
  readonly #items: SignalWindow[] = [];
  readonly #payloads: SignalPayload[] = [];

  public push(window: SignalWindow, payload: SignalPayload): void {
    this.#items.push(window);
    this.#payloads.push(payload);
  }

  public snapshot(twinId: string): TimelineStoreRow {
    return {
      runId: twinId,
      windows: [...this.#items],
    };
  }

  public filter(filter: TimelineWindowFilter): SignalWindow[] {
    const all = this.#items.filter((window) => window.from >= filter.minFrom && window.to <= filter.maxTo);
    if (all.length === 0 && filter.includeEmpty) {
      return [];
    }
    return all;
  }

  public [Symbol.iterator](): IterableIterator<SignalWindow> {
    return this.#items[Symbol.iterator]();
  }

  public timeline(): TimelineIterator<SignalWindow> {
    return createTimeline(this.#items);
  }

  public payloads(): readonly SignalPayload[] {
    return this.#payloads;
  }
}

export interface TimelineState {
  readonly byRun: ReadonlyMap<TwinId, TimelineStoreRow>;
}

export class TimelineStore {
  readonly #rows = new Map<TwinId, TimelineStoreRow>();

  public write(twinId: TwinId, rows: readonly SignalWindow[]): void {
    this.#rows.set(twinId, {
      runId: twinId,
      windows: [...rows],
    });
  }

  public read(twinId: TwinId): TimelineStoreRow | undefined {
    return this.#rows.get(twinId);
  }

  public snapshot(): TimelineState {
    return {
      byRun: this.#rows,
    };
  }
}
