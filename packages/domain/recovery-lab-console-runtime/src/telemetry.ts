import { NoInfer } from '@shared/type-level';
import type { RuntimeEventKind, RuntimeEventPayload, RuntimeRunId, RuntimeScope, RuntimeEventChannel } from './types.js';

interface RuntimeTrace {
  readonly at: string;
  readonly kind: RuntimeEventKind;
  readonly scope: RuntimeScope;
  readonly details: Record<string, unknown>;
}

type RuntimeTraceSelector<TScope extends RuntimeScope = RuntimeScope> = {
  readonly scope?: TScope;
  readonly channels?: readonly string[];
  readonly limit?: number;
};

export type TracePoint = {
  readonly index: number;
  readonly offsetMs: number;
  readonly value: number;
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export class RuntimeTelemetry implements AsyncDisposable {
  readonly #channel = new Map<string, RuntimeTrace[]>();
  readonly #raw: RuntimeTrace[] = [];
  #disposed = false;

  public push<T extends Record<string, unknown>>(event: RuntimeEventPayload<T>): void {
    if (this.#disposed) {
      return;
    }

    const eventPayload = event.payload as {
      kind?: RuntimeEventKind;
      details?: { scope?: RuntimeScope };
      [key: string]: unknown;
    };

    const payload = {
      at: event.at,
      kind: eventPayload.kind,
      scope: eventPayload.details?.scope ?? 'topology',
      details: event.payload,
    };

    const normalized: RuntimeTrace = {
      at: event.at,
      kind: (payload.kind ?? 'runtime.started') as RuntimeEventKind,
      scope: payload.scope,
      details: {
        ...payload.details,
      },
    };

    this.#raw.push(normalized);

    const bucket = this.#channel.get(event.channel) ?? [];
    bucket.push(normalized);
    this.#channel.set(event.channel, bucket);
  }

  public has(channel: RuntimeEventChannel): boolean {
    return this.#channel.has(channel);
  }

  public events({ scope, channels, limit }: RuntimeTraceSelector = {}): readonly RuntimeTrace[] {
    const selected = this.#raw.filter((event) => {
      if (scope && event.scope !== scope) {
        return false;
      }
      if (!channels || channels.length === 0) {
        return true;
      }
      return channels.includes(event.scope);
    });

    const sorted = selected
      .toSorted((left, right) => left.at.localeCompare(right.at))
      .slice(0, limit ?? selected.length);

    return sorted;
  }

  public summarize(limit: number = 5): string[] {
    const channels = [...this.#channel.keys()];
    return channels
      .map((channel) => {
        const entries = this.#channel.get(channel) ?? [];
        return `${channel}: ${entries.length} events`;
      })
      .toSorted()
      .slice(0, limit);
  }

  public trend(runId: RuntimeRunId): TracePoint[] {
    const bucket = this.events().map((event, index, all) => {
      const previous = index === 0 ? new Date(event.at).getTime() : new Date(all[index - 1]?.at ?? event.at).getTime();
      const next = new Date(event.at).getTime();
      const gap = next - previous;
      return {
        index,
        offsetMs: index * 17,
        value: clamp((gap % 100) + 1),
      };
    });

    return bucket.filter((point) => Number.isFinite(point.value));
  }

  public clear(): void {
    this.#channel.clear();
    this.#raw.length = 0;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.clear();
  }
}

export interface RuntimeTelemetryReporter {
  readonly push: (event: RuntimeEventPayload) => void;
  readonly summarize: () => string[];
  readonly trend: (runId: RuntimeRunId) => TracePoint[];
}

export const createTelemetrySink = (telemetry = new RuntimeTelemetry()): RuntimeTelemetryReporter => telemetry;

export const collectTrace = <TRecords extends readonly RuntimeEventPayload[]>(
  records: NoInfer<TRecords>,
  runId: RuntimeRunId,
): {
  readonly records: Readonly<TRecords>;
  readonly summary: string[];
  readonly runId: RuntimeRunId;
  readonly size: number;
} => ({
  records,
  summary: records.map((event) => `${runId}:${event.channel}`).toSorted(),
  runId,
  size: records.length,
});

export const normalizeScope = (value: string): RuntimeScope =>
  value === 'signal'
    ? 'signal'
    : value === 'policy'
      ? 'policy'
      : value === 'command'
        ? 'command'
        : value === 'telemetry'
          ? 'telemetry'
          : value === 'synthesis'
            ? 'synthesis'
            : 'topology';
