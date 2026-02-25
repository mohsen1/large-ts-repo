import type { NoInfer } from './tuple-utils';

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogTag<T extends string = string> = `tag:${T}`;
export type TraceToken<TName extends string = string> = `trace:${TName}`;
export type TelemetryRoute<T extends string = string> = `telemetry:${T}`;

export type TelemetryRecord<TValue = unknown> = {
  readonly trace: TraceToken<string>;
  readonly route: TelemetryRoute;
  readonly at: number;
  readonly severity: Severity;
  readonly message: string;
  readonly payload: TValue;
};

export type TelemetryEnvelope<TPayload extends Record<string, unknown>> = {
  readonly trace: TraceToken<string>;
  readonly route: TelemetryRoute;
  readonly records: readonly TelemetryRecord<TPayload>[];
  readonly createdAt: string;
};

export type TelemetryCollector<TPayload extends Record<string, unknown>> = (entry: TelemetryRecord<TPayload>) => void;

export interface TelemetryWindow<TPayload extends Record<string, unknown>> {
  readonly start: string;
  readonly end: string;
  readonly route: TelemetryRoute;
  readonly entries: readonly TelemetryRecord<TPayload>[];
}

export interface DisposedTelemetryHandle {
  readonly closedAt: string;
  [Symbol.dispose](): void;
}

export interface AsyncDisposedTelemetryHandle {
  readonly closedAt: string;
  [Symbol.asyncDispose](): Promise<void>;
}

type SeverityBuckets = { [K in Severity]: number };

export type TraceSummary<TPayload extends Record<string, unknown>> = {
  readonly trace: TraceToken<string>;
  readonly count: number;
  readonly buckets: SeverityBuckets;
  readonly route: TelemetryRoute;
  readonly last: TelemetryRecord<TPayload> | undefined;
};

const now = (): number => Date.now();

const makeBucket = (): SeverityBuckets => ({
  debug: 0,
  info: 0,
  warn: 0,
  error: 0,
  fatal: 0,
});

const normalizeSeverity = (severity: string): Severity =>
  severity === 'debug' || severity === 'info' || severity === 'warn' || severity === 'error' || severity === 'fatal'
    ? severity
    : 'info';

const routePrefix = (name: string): TelemetryRoute => `telemetry:${name}` as TelemetryRoute;

const profile = {
  route: routePrefix('studio/runtime'),
  windowMs: 30_000,
  flushEvery: 16,
};

export class TelemetryStream<TPayload extends Record<string, unknown>> {
  readonly #records: TelemetryRecord<TPayload>[] = [];
  readonly #route: TelemetryRoute;

  public constructor(private readonly routeName: TelemetryRoute = profile.route) {
    this.#route = routeName;
  }

  public emit<TInput extends TPayload>(
    value: {
      trace: TraceToken<string>;
      severity?: string;
      message: string;
      payload: TInput;
    },
  ): TelemetryRecord<TPayload> {
    const record: TelemetryRecord<TPayload> = {
      trace: value.trace,
      route: this.#route,
      at: now(),
      severity: normalizeSeverity(value.severity ?? 'info'),
      message: value.message,
      payload: value.payload,
    };
    this.#records.push(record);
    return record;
  }

  public flush(): readonly TelemetryRecord<TPayload>[] {
    return this.#records.splice(0, profile.flushEvery);
  }

  public *[Symbol.iterator](): IterableIterator<TelemetryRecord<TPayload>> {
    for (const record of this.#records) {
      yield record;
    }
  }

  public close(): void {
    this.#records.length = 0;
  }

  public [Symbol.dispose](): void {
    this.close();
  }
}

export class AsyncTelemetryStream<TPayload extends Record<string, unknown>> {
  readonly #records: TelemetryRecord<TPayload>[] = [];
  readonly #createdAt = new Date().toISOString();
  readonly #stack = new AsyncDisposableStack();

  public constructor(private readonly routeName: TelemetryRoute = profile.route) {
    this.#stack.use({
      [Symbol.asyncDispose]: async () => {
        this.#records.length = 0;
      },
    });
  }

  public async push<TInput extends TPayload>(
    value: {
      trace: TraceToken<string>;
      severity?: string;
      message: string;
      payload: TInput;
    },
  ): Promise<TelemetryRecord<TPayload>> {
    const record: TelemetryRecord<TPayload> = {
      trace: value.trace,
      route: this.routeName,
      at: now(),
      severity: normalizeSeverity(value.severity ?? 'info'),
      message: value.message,
      payload: value.payload,
    };
    this.#records.push(record);
    return record;
  }

  public window<TInput extends NoInfer<unknown>>(windowMs: number): TelemetryWindow<TPayload> {
    const range = Math.max(1, Math.floor(windowMs));
    const lower = now() - Math.min(profile.windowMs, range);
    return {
      start: new Date(lower).toISOString(),
      end: new Date().toISOString(),
      route: this.routeName,
      entries: this.#records.filter((entry) => entry.at >= lower),
    };
  }

  public summary(): readonly TraceSummary<TPayload>[] {
    const summary = new Map<string, { route: TelemetryRoute; records: TelemetryRecord<TPayload>[] }>();
    for (const entry of this.#records) {
      const bucket = summary.get(entry.trace);
      if (!bucket) {
        summary.set(entry.trace, { route: entry.route, records: [entry] });
      } else {
        bucket.records.push(entry);
      }
    }

    return Array.from(summary.entries()).map(([trace, entry]) => {
      const buckets = makeBucket();
      for (const record of entry.records) {
        buckets[record.severity] += 1;
      }
      return {
        trace: trace as TraceToken<string>,
        count: entry.records.length,
        buckets,
        route: entry.route,
        last: entry.records.at(-1),
      } as TraceSummary<TPayload>;
    });
  }

  public async close(): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

export const collectTelemetrySnapshot = <TPayload extends Record<string, unknown>>(
  stream: TelemetryStream<TPayload>,
): TelemetryEnvelope<TPayload> => {
  const records = stream.flush();
  const route = records[0]?.route ?? routePrefix('studio');
  return {
    trace: records[0]?.trace ?? ('trace:studio-runtime' as TraceToken),
    route,
    records,
    createdAt: new Date().toISOString(),
  };
};

export const buildSeverityTrend = <TPayload extends Record<string, unknown>>(
  stream: AsyncTelemetryStream<TPayload>,
): readonly [Severity, number][] => {
  const summaries = stream.summary();
  const flattened = summaries.flatMap((entry) =>
    (Object.entries(entry.buckets) as Array<[Severity, number]>).map(([severity, count]) => [severity, count] as const),
  );
  return [...flattened].sort((left, right) => right[1] - left[1]) as unknown as readonly [Severity, number][];
};

export const splitByRoute = <TPayload extends Record<string, unknown>>(
  records: readonly TelemetryRecord<TPayload>[],
): ReadonlyMap<TelemetryRoute, readonly TelemetryRecord<TPayload>[]> => {
  const grouped = new Map<TelemetryRoute, TelemetryRecord<TPayload>[]>();
  for (const record of records) {
    const bucket = grouped.get(record.route);
    if (!bucket) {
      grouped.set(record.route, [record]);
      continue;
    }
    bucket.push(record);
  }
  return new Map(grouped);
};

export const compactLog = <TPayload extends Record<string, unknown>>(
  records: readonly TelemetryRecord<TPayload>[],
): readonly string[] => {
  const entries = new Map<string, string>();
  for (const record of records) {
    entries.set(record.trace, `${record.trace}: ${record.severity.toUpperCase()}: ${record.message}`);
  }
  return [...entries.values()];
};
