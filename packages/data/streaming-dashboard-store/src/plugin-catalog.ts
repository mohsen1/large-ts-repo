import { NoInfer, RecursivePath } from '@shared/type-level';
import { PluginTraceId, StreamPolicyDecisionRecord } from '@domain/streaming-observability';

export interface PluginDecisionRecord {
  readonly traceId: PluginTraceId;
  readonly streamId: string;
  readonly pluginName: string;
  readonly policySeverity: StreamPolicyDecisionRecord['severityLevel'];
  readonly warnings: readonly string[];
  readonly executedAt: string;
}

export interface PluginDecisionSnapshot {
  readonly streamId: string;
  readonly count: number;
  readonly warnings: number;
}

export type KeyedDecisions<T extends readonly PluginDecisionRecord[]> = {
  [R in T[number] as R['streamId']]: R[];
};

export type DecisionPath<T extends readonly string[]> =
  T extends readonly [infer H extends string, ...infer Rest extends readonly string[]]
    ? `${H}${Rest[number] extends string ? `/${DecisionPath<Rest>}` : ''}`
    : never;

export class StreamingPluginCatalog implements AsyncDisposable {
  private readonly rows = new Map<string, PluginDecisionRecord[]>();
  private readonly maxRowsPerStream: number;
  private disposed = false;

  public constructor(options: { maxRowsPerStream?: number } = {}) {
    this.maxRowsPerStream = options.maxRowsPerStream ?? 100;
  }

  public record(record: PluginDecisionRecord): void {
    if (this.disposed) return;
    const existing = [...(this.rows.get(record.streamId) ?? [])];
    existing.push(record);
    const next = existing.slice(-this.maxRowsPerStream);
    this.rows.set(record.streamId, next);
  }

  public snapshot(streamId: string): PluginDecisionSnapshot {
    const records = this.rows.get(streamId) ?? [];
    const warningCount = records.reduce((acc, row) => acc + row.warnings.length, 0);
    return { streamId, count: records.length, warnings: warningCount };
  }

  public *iter(): IterableIterator<PluginDecisionRecord> {
    for (const rows of this.rows.values()) {
      for (const record of rows) {
        yield record;
      }
    }
  }

  public async *streamByStream(
    streamId: string,
  ): AsyncGenerator<PluginDecisionRecord, void, void> {
    const rows = this.rows.get(streamId) ?? [];
    for (const record of rows) {
      yield record;
    }
  }

  public async queryWarnings<TRoute extends readonly string[]>(routes: NoInfer<TRoute>): Promise<number> {
    const routeValue: readonly string[] = routes;
    const warnings = [...routeValue].flatMap((route) =>
      [...this.iter()].filter((record) => record.pluginName.includes(route)),
    );
    return warnings.length;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.rows.clear();
  }

  public keys<K extends string>(): readonly K[] {
    return [...this.rows.keys()] as unknown as readonly K[];
  }
}

export const emptyCatalog = new StreamingPluginCatalog();

export const queryDecisionPath = <T extends readonly string[]>(
  routes: T,
): DecisionPath<T> | '[]' => {
  const flattened = [...routes].flat();
  return (flattened.join('/') || '[]') as DecisionPath<T>;
};

export const summarizeCatalog = <TRow extends readonly PluginDecisionRecord[]>(rows: TRow): {
  readonly rows: number;
  readonly paths: RecursivePath<{
    [K in TRow[number] as K['streamId']]: {
      count: number;
      warnings: number;
    };
  }>;
  readonly totalWarnings: number;
} => {
  const totalWarnings = rows.reduce((acc, row) => acc + row.warnings.length, 0);
  const byStream = rows.reduce<Record<string, { count: number; warnings: number }>>((acc, row) => {
    const current = acc[row.streamId] ?? { count: 0, warnings: 0 };
    acc[row.streamId] = {
      count: current.count + 1,
      warnings: current.warnings + row.warnings.length,
    };
    return acc;
  }, {});
  const paths = byStream as unknown as RecursivePath<{
    [K in TRow[number] as K['streamId']]: {
      count: number;
      warnings: number;
    };
  }>;
  return { rows: rows.length, paths, totalWarnings };
};
