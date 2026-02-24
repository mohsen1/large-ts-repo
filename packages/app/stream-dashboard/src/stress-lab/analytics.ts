import { type StreamLabExecutionResult, type StreamLabExecutionTrace, type StreamLabScoredRun, type StreamLabRequest } from './types';

export interface StreamLabTimelinePoint {
  readonly stage: string;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly status: StreamLabExecutionTrace['status'];
}

export interface StreamLabAnalytics {
  readonly requestHash: string;
  readonly signalCount: number;
  readonly pluginCount: number;
  readonly warningScore: number;
  readonly riskBucket: Readonly<Record<'critical' | 'high' | 'medium' | 'low', number>>;
  readonly timeline: readonly StreamLabTimelinePoint[];
}

type RiskState = keyof StreamLabAnalytics['riskBucket'];

type NumberMap<T extends Record<string, unknown>> = {
  [K in keyof T as T[K] extends number ? K : never]: T[K];
};

type IteratorLike<T> = {
  map<U>(transform: (value: T) => U): IteratorLike<U> & { toArray(): U[] };
  toArray(): T[];
};

type IteratorFrom = { <T>(value: Iterable<T>): IteratorLike<T> & { toArray(): T[] } };
const iteratorFactory: IteratorFrom | undefined = (globalThis as { Iterator?: { from?: IteratorFrom } }).Iterator?.from;

const riskBucket = (items: readonly StreamLabExecutionTrace[]) => {
  const buckets: { critical: number; high: number; medium: number; low: number } = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const update = (status: StreamLabExecutionTrace['status'], index: number) => {
    if (status === 'failed') {
      buckets.critical += 1;
      return;
    }
    if (status === 'running') {
      buckets.medium += index + 1;
      return;
    }
    if (status === 'queued') {
      buckets.low += 1;
      return;
    }
    buckets.high += 1;
  };

  for (const [index, trace] of items.entries()) {
    update(trace.status, index);
  }
  return buckets;
};

const makePoints = (traces: readonly StreamLabExecutionTrace[]): readonly StreamLabTimelinePoint[] => {
  const points = traces.map((trace) => ({
    stage: trace.pluginName,
    startedAt: trace.startedAt,
    elapsedMs: trace.elapsedMs,
    status: trace.status,
  }));

  const iterator = iteratorFactory?.(points);
  return iterator
    ? iterator.toArray().toSorted((left, right) =>
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
    )
    : points.toSorted((left, right) =>
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
    );
};

const buildHash = (request: StreamLabRequest): string => {
  const values = [
    request.tenantId,
    request.streamId,
    request.route.join('.'),
    request.options.maxExecutionMs.toString(),
  ];
  return `${values.join('#')}#${values.length}`;
};

const warningFromResult = (result: StreamLabExecutionResult): number =>
  result.trace.reduce((acc, trace) => acc + (trace.status === 'failed' ? 4 : trace.status === 'running' ? 2 : 0), 0);

export const buildAnalytics = (
  request: StreamLabRequest,
  result: StreamLabExecutionResult,
  scored: StreamLabScoredRun,
): StreamLabAnalytics => {
  const risk = riskBucket(result.trace);
  const timeline = makePoints(result.trace);
  const warningScore = warningFromResult(result) + scored.metrics.alertCount;
  return {
    requestHash: buildHash(request),
    signalCount: result.finalSignals.length,
    pluginCount: result.recommendations.length,
    warningScore,
    riskBucket: risk,
    timeline,
  };
};

export const trendFromHistory = (history: readonly StreamLabAnalytics[]) => {
  if (history.length === 0) return [] as const;
  const sorted = history.toSorted((left, right) => right.warningScore - left.warningScore);
  const points = sorted.map((entry, index) => ({ stage: `point-${index}`, deltaWarning: entry.warningScore }));
  const iterator = iteratorFactory?.(points);
  return iterator ? iterator.toArray().toSorted((left, right) => right.deltaWarning - left.deltaWarning) : points;
};

export const summarizeScoredRun = (scored: StreamLabScoredRun): NumberMap<typeof scored.metrics> => {
  const copy = {
    score: scored.metrics.score,
    alertCount: scored.metrics.alertCount,
  };
  return copy;
};

const flattenTopologyDigest = (run: StreamLabScoredRun): readonly string[] => {
  return run.topologyDigest.split('|').map((item, index) => `${index}:${item}`);
};

export const summarizeTopologyDigest = (run: StreamLabScoredRun) => {
  const nodes = flattenTopologyDigest(run);
  return {
    runId: run.runId,
    count: nodes.length,
    nodes,
  };
};
