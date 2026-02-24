import type { RuntimeEventPayload, RuntimeRunId, RuntimeScope } from './types.js';
import { createTelemetrySink, type RuntimeTelemetryReporter, normalizeScope, collectTrace } from './telemetry.js';

interface InspectorOptions {
  readonly scope?: RuntimeScope;
  readonly limit?: number;
  readonly reverse?: boolean;
}

export interface RuntimeSnapshot {
  readonly runId: RuntimeRunId;
  readonly events: readonly RuntimeEventPayload[];
  readonly trend: readonly { readonly at: string; readonly value: number }[];
  readonly labels: readonly string[];
}

export interface RuntimeWindow {
  readonly from: string;
  readonly to: string;
  readonly eventCount: number;
}

const windowFromEvents = (events: readonly RuntimeEventPayload[]): RuntimeWindow => {
  if (events.length === 0) {
    const now = new Date().toISOString();
    return { from: now, to: now, eventCount: 0 };
  }

  const sorted = [...events].toSorted((left, right) => left.at.localeCompare(right.at));
  return {
    from: sorted[0]?.at ?? '',
    to: sorted[sorted.length - 1]?.at ?? '',
    eventCount: sorted.length,
  };
};

const selectByScope = <TEvents extends readonly RuntimeEventPayload[]>(
  events: TEvents,
  scope?: RuntimeScope,
): TEvents => {
  if (!scope) {
    return events;
  }
  const selected = (events as unknown as readonly RuntimeEventPayload[]).filter(
    (event) => (event.payload as { scope?: RuntimeScope })?.scope === scope || event.channel.includes(scope),
  );
  return selected as unknown as TEvents;
};

const trendSeries = (events: readonly RuntimeEventPayload[]) =>
  events.reduce<{ readonly at: string; readonly value: number }[]>((acc, event, index) => {
    const previous = new Date(index === 0 ? event.at : events[index - 1]?.at ?? event.at).getTime();
    const delta = new Date(event.at).getTime() - previous;
    acc.push({
      at: event.at,
      value: delta,
    });
    return acc;
  }, []);

export const inspectRun = (runId: RuntimeRunId, events: readonly RuntimeEventPayload[], options: InspectorOptions = {}): RuntimeSnapshot => {
  const selected = selectByScope(events, options.scope);
  let normalized = [...selected].slice();
  if (options.reverse) {
    normalized = normalized.toSorted((left, right) => right.at.localeCompare(left.at));
  } else {
    normalized = normalized.toSorted((left, right) => left.at.localeCompare(right.at));
  }

  const limited = normalized.slice(0, options.limit ?? normalized.length);
  const labels = new Set<string>();
  for (const event of limited) {
    labels.add(event.channel);
    if (event.payload.details) {
      labels.add(`${event.payload.kind}:${String((event.payload as { kind?: string }).kind)}`);
    }
  }

  const sink: RuntimeTelemetryReporter = createTelemetrySink();
  for (const event of limited) {
    sink.push(event);
  }

  return {
    runId,
    events: limited,
    trend: trendSeries(limited),
    labels: [...labels],
  };
};

export const formatWindow = (snapshot: RuntimeSnapshot): RuntimeWindow => windowFromEvents(snapshot.events);

export const summarizeEvents = (events: readonly RuntimeEventPayload[], max: number = 12): readonly string[] =>
  collectTrace(events, 'run-summary' as RuntimeRunId).summary.slice(0, max);

export const detectScope = (events: readonly RuntimeEventPayload[]): RuntimeScope[] => {
  const normalized = events.map((event): RuntimeScope => {
    const details = event.payload as { details?: { scope?: string } };
    return normalizeScope(String(details?.details?.scope ?? 'topology')) as RuntimeScope;
  });
  return [...new Set(normalized)] as RuntimeScope[];
};
