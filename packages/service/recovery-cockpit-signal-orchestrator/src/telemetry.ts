import type { MeshEvent, MeshExecutionPhase } from '@domain/recovery-cockpit-signal-mesh';

export interface TelemetryRecord {
  readonly at: string;
  readonly phase: MeshExecutionPhase;
  readonly payload: MeshEvent;
}

export interface TelemetryConfig {
  readonly enabled: boolean;
  readonly flushWindowMs: number;
  readonly sampleRate: number;
}

export class TelemetrySink {
  readonly #records: TelemetryRecord[] = [];
  readonly #config: TelemetryConfig;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: TelemetryConfig) {
    this.#config = config;
  }

  emit(event: MeshEvent): TelemetryRecord {
    const item: TelemetryRecord = {
      at: new Date().toISOString(),
      phase: event.phase,
      payload: event,
    };
    if (this.#config.enabled && Math.random() <= this.#config.sampleRate) {
      this.#records.push(item);
    }
    return item;
  }

  drain(): readonly TelemetryRecord[] {
    const records = [...this.#records];
    this.#records.length = 0;
    return records;
  }

  startPeriodicFlush(callback: (records: readonly TelemetryRecord[]) => void): () => void {
    if (!this.#config.enabled || this.#config.flushWindowMs <= 0) {
      return () => undefined;
    }
    this.#timer = setInterval(() => {
      const records = this.drain();
      if (records.length > 0) {
        callback(records);
      }
    }, this.#config.flushWindowMs);
    return () => {
      if (this.#timer !== undefined) {
        clearInterval(this.#timer);
        this.#timer = undefined;
      }
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#records.length = 0;
  }
}

export const runTelemetryLoop = (config: TelemetryConfig): ((event: MeshEvent) => void) => {
  const sink = new TelemetrySink(config);
  sink.startPeriodicFlush(() => undefined);
  return (event: MeshEvent) => {
    sink.emit(event);
  };
};
