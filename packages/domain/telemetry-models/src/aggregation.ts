import { NormalizedTelemetrySample, EventWindow, RollingWindow, TenantId, RouteRule, RoutingContext, TimestampMs } from './types';

export interface WindowBucket {
  readonly start: TimestampMs;
  readonly end: TimestampMs;
  readonly tenantId: TenantId;
  readonly count: number;
  readonly valuesByName: Readonly<Record<string, number>>;
}

export interface AggregateResult {
  readonly buckets: WindowBucket[];
  readonly totalEvents: number;
  readonly byTenant: Readonly<Record<string, number>>;
}

export const partitionByTenant = (events: ReadonlyArray<NormalizedTelemetrySample>): Readonly<Record<string, NormalizedTelemetrySample[]>> => {
  const out = new Map<string, NormalizedTelemetrySample[]>();
  for (const event of events) {
    const bucket = out.get(event.tenantId) ?? [];
    bucket.push(event);
    out.set(event.tenantId, bucket);
  }
  return Object.fromEntries(out);
}

export const windowFrom = (window: RollingWindow): (value: number) => boolean => {
  return (value: number) => value >= window.start && value < window.end;
};

export const bucketEvents = (events: ReadonlyArray<NormalizedTelemetrySample>, config: RollingWindow): EventWindow<unknown>[] => {
  const buckets = new Map<number, NormalizedTelemetrySample[]>();
  for (const event of events) {
    const bucketStart = Math.floor(event.timestamp / config.grainMs) * config.grainMs;
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(event);
    buckets.set(bucketStart, bucket);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([start, samples]) => ({
      start: start as TimestampMs,
      end: (start + config.grainMs) as TimestampMs,
      samples,
    }));
};

export const summarizeBuckets = (events: ReadonlyArray<NormalizedTelemetrySample>, windows: ReadonlyArray<RollingWindow>): AggregateResult => {
  const latestWindow = windows.reduce<RollingWindow | null>((acc, window) => {
    if (!acc) return window;
    if (window.end > acc.end) return window;
    return acc;
  }, null);

  const scopeEvents = latestWindow
    ? events.filter((event) => event.timestamp >= latestWindow.start && event.timestamp <= latestWindow.end)
    : events;

  const byTenant = partitionByTenant(scopeEvents);
  const buckets: WindowBucket[] = [];

  for (const [tenantId, tenantEvents] of Object.entries(byTenant)) {
    const valuesByName = tenantEvents.reduce<Record<string, number[]>>((acc, event) => {
      const key = event.sample.signal === 'metric' && typeof event.sample.payload === 'object' && event.sample.payload && 'name' in event.sample.payload
        ? String((event.sample.payload as { name: string }).name)
        : 'generic';
      const numeric = typeof (event.sample.payload as { value?: number }).value === 'number'
        ? (event.sample.payload as { value?: number }).value as number
        : 0;
      acc[key] = acc[key] ?? [];
      acc[key].push(numeric);
      return acc;
    }, {});

    const first = tenantEvents.at(0)?.timestamp ?? 0;
    const last = tenantEvents.at(-1)?.timestamp ?? 0;
    const sortedValues = Object.entries(valuesByName).reduce<Record<string, number>>((acc, [name, values]) => {
      acc[name] = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      return acc;
    }, {});

    buckets.push({
      start: first as TimestampMs,
      end: last as TimestampMs,
      tenantId: tenantId as TenantId,
      count: tenantEvents.length,
      valuesByName: sortedValues,
    });
  }

  return {
    buckets,
    totalEvents: scopeEvents.length,
    byTenant: Object.fromEntries(
      Object.entries(byTenant).map(([tenantId, values]) => [tenantId, values.length])
    ),
  };
};

export const selectRoutes = (
  rules: ReadonlyArray<RouteRule>,
  context: RoutingContext,
): ReadonlyArray<RouteRule> => {
  const includeTag = (rule: RouteRule): boolean => rule.include.every((segment) =>
    Object.entries(context.tags).some(([key, value]) => `${key}=${value}` === segment)
  );
  const excludeTag = (rule: RouteRule): boolean => rule.exclude.some((segment) =>
    Object.entries(context.tags).some(([key, value]) => `${key}=${value}` === segment)
  );

  return rules
    .filter((rule) => rule.tenantId === context.tenantId && rule.signal === context.signal)
    .filter((rule) => !excludeTag(rule))
    .filter(includeTag)
    .sort((left, right) => right.target.length - left.target.length);
};
