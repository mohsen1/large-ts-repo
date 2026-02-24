import type { SignalEvent, StrategyMode, StrategyLane, RunId, SessionId } from './types';

export type EventGroup = {
  readonly sessionId: SessionId;
  readonly runId: RunId;
  readonly route: string;
  readonly events: readonly SignalEvent[];
};

interface TimelineEntry {
  readonly at: number;
  readonly event: SignalEvent;
}

export class StrategyTelemetry {
  readonly #session: SessionId;
  readonly #run: RunId;
  readonly #entries: TimelineEntry[] = [];
  #closed = false;

  constructor(session: SessionId, run: RunId) {
    this.#session = session;
    this.#run = run;
  }

  get sessionId(): SessionId {
    return this.#session;
  }

  get runId(): RunId {
    return this.#run;
  }

  get closed() {
    return this.#closed;
  }

  record(event: SignalEvent): void {
    if (this.#closed) return;
    this.#entries.push({
      at: Date.now(),
      event,
    });
  }

  recordMany(events: readonly SignalEvent[]): void {
    for (const event of events) {
      this.record(event);
    }
  }

  toEvents(): readonly SignalEvent[] {
    return [...this.#entries]
      .sort((left, right) => left.at - right.at)
      .map((entry) => entry.event);
  }

  bySeverity(severity: SignalEvent['severity']): readonly SignalEvent[] {
    return this.toEvents().filter((event) => event.severity === severity);
  }

  bySource(source: SignalEvent['source']): readonly SignalEvent[] {
    return this.toEvents().filter((event) => event.source === source);
  }

  tail(count: number): readonly SignalEvent[] {
    return this.toEvents().toReversed().slice(0, count).toReversed();
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return {
      sessionId: this.#session,
      runId: this.#run,
      count: this.#entries.length,
      closed: this.#closed,
      firstAt: this.#entries.at(0)?.at,
      lastAt: this.#entries.at(-1)?.at,
    };
  }

  clear(): void {
    this.#entries.length = 0;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    this.#entries.length = 0;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
    this.#entries.length = 0;
  }
}

export interface EventSummary {
  readonly byMode: Record<StrategyMode, number>;
  readonly byLane: Record<StrategyLane, number>;
  readonly warnings: number;
  readonly errors: number;
  readonly criticial: number;
}

export const summarizeEvents = (events: readonly SignalEvent[]): EventSummary => {
  const byMode = events.reduce<Record<StrategyMode, number>>(
    (acc, event) => ({
      ...acc,
      [extractMode(event)]: (acc[extractMode(event)] ?? 0) + 1,
    }),
    {
      simulate: 0,
      analyze: 0,
      stress: 0,
      plan: 0,
      synthesize: 0,
    },
  );

  const byLane = events.reduce<Record<StrategyLane, number>>(
    (acc, event) => ({
      ...acc,
      [extractLane(event)]: (acc[extractLane(event)] ?? 0) + 1,
    }),
    {
      forecast: 0,
      resilience: 0,
      containment: 0,
      recovery: 0,
      assurance: 0,
    },
  );

  const warnings = events.filter((event) => event.severity === 'warn').length;
  const errors = events.filter((event) => event.severity === 'error').length;
  const criticial = events.filter((event) => event.severity === 'critical' || event.severity === 'fatal').length;

  return {
    byMode,
    byLane,
    warnings,
    errors,
    criticial,
  };
};

export const foldBySource = (events: readonly SignalEvent[]): Record<string, number> => {
  return events.reduce<Record<string, number>>((acc, event) => {
    return {
      ...acc,
      [event.source]: (acc[event.source] ?? 0) + 1,
    };
  }, {});
};

export const asEventGroups = (events: readonly SignalEvent[], sessionId: SessionId, runId: RunId): readonly EventGroup[] => {
  const grouped = new Map<string, SignalEvent[]>();
  for (const event of events) {
    const route = `${event.source}:${event.severity}`;
    const bucket = grouped.get(route);
    if (bucket) {
      bucket.push(event);
    } else {
      grouped.set(route, [event]);
    }
  }

  return [...grouped.entries()].map(([route, bucket]) => ({
    sessionId,
    runId,
    route,
    events: bucket,
  }));
};

export const extractMode = (event: SignalEvent): StrategyMode => {
  const modeFromSource = String(event.source).split(':').at(0);
  const fallback: StrategyMode = 'simulate';
  return modeFromSource === 'simulate' || modeFromSource === 'analyze' || modeFromSource === 'stress' || modeFromSource === 'plan' || modeFromSource === 'synthesize'
    ? (modeFromSource as StrategyMode)
    : fallback;
};

export const extractLane = (event: SignalEvent): StrategyLane => {
  const laneFromDetail = String(event.source).split(':')[1] as StrategyLane | undefined;
  const routeBySeverity: StrategyLane = event.severity === 'fatal' ? 'assurance' : 'forecast';
  const fallback: StrategyLane = 'forecast';
  if (['forecast', 'resilience', 'containment', 'recovery', 'assurance'].includes(String(laneFromDetail))) {
    return laneFromDetail as StrategyLane;
  }
  return routeBySeverity ?? fallback;
};

export const toTimelineSeries = (
  events: readonly SignalEvent[],
): readonly { readonly at: number; readonly count: number; readonly mode: StrategyMode }[] => {
  return [...new Set(events.map((event) => extractMode(event)))]
    .toSorted()
    .map((mode) => ({
      at: Date.now(),
      count: events.filter((event) => extractMode(event) === mode).length,
      mode,
    }));
};
