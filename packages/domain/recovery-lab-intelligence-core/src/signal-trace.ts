import { asRunId } from './types';
import type { StrategyMode, StrategyLane, RunId } from './types';

export const traceSeverities = ['info', 'warn', 'error', 'critical'] as const;

export type TraceSeverity = (typeof traceSeverities)[number];
export type TraceScope = `${string}::${string}`;
export type TraceRoute = `${StrategyMode}/${StrategyLane}`;

export interface TraceEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly at: string;
  readonly scope: TraceScope;
  readonly route: TraceRoute;
  readonly severity: TraceSeverity;
  readonly payload: TPayload;
}

export interface TraceDigest {
  readonly scope: TraceScope;
  readonly route: TraceRoute;
  readonly count: number;
  readonly firstSeen: string | null;
  readonly lastSeen: string | null;
}

export interface TraceSubscription {
  readonly scope: TraceScope;
  readonly unsubscribe: () => void;
  [Symbol.dispose](): void;
}

interface QueueEntry {
  readonly at: number;
  readonly event: TraceEnvelope<Record<string, unknown>>;
}

type AsyncDisposableStackLike = {
  use<T>(value: T): T;
  disposeAsync(): Promise<void>;
  defer(callback: () => void | Promise<void>): void;
};

const normalizeScope = (scope: string): TraceScope => `${scope}` as TraceScope;
const normalizeRunId = (scope: string): RunId => asRunId(`${scope}`);

export interface TraceBusOptions {
  readonly scope: TraceScope;
  readonly capacity: number;
  readonly route: TraceRoute;
}

export interface TraceBusSnapshot {
  readonly at: string;
  readonly scope: TraceScope;
  readonly route: TraceRoute;
  readonly events: readonly TraceEnvelope[];
}

export class IntelligenceTraceBus<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly #scope: TraceScope;
  readonly #route: TraceRoute;
  readonly #capacity: number;
  #events: Array<{ readonly at: number; readonly event: TraceEnvelope<TPayload> }> = [];
  #listeners = new Set<(event: TraceEnvelope<TPayload>) => void | Promise<void>>();
  #closed = false;

  constructor(options: TraceBusOptions) {
    this.#scope = normalizeScope(options.scope);
    this.#route = options.route;
    this.#capacity = options.capacity;
  }

  get scope(): TraceScope {
    return this.#scope;
  }

  get route(): TraceRoute {
    return this.#route;
  }

  get active(): boolean {
    return !this.#closed;
  }

  subscribe(handler: (event: TraceEnvelope<TPayload>) => void | Promise<void>): TraceSubscription {
    this.#listeners.add(handler);
    const handlerRef = handler;
    const listeners = this.#listeners;
    const scope = this.#scope;
    return {
      scope: scope,
      unsubscribe: () => {
        listeners.delete(handlerRef);
      },
      [Symbol.dispose](): void {
        listeners.delete(handlerRef);
      },
    };
  }

  async emit(event: Omit<TraceEnvelope<TPayload>, 'at'>): Promise<void> {
    if (this.#closed) {
      return;
    }
    const enriched: TraceEnvelope<TPayload> = {
      ...event,
      at: new Date().toISOString(),
    };

    this.#events.push({
      at: Date.now(),
      event: enriched,
    });

    if (this.#events.length > this.#capacity) {
      this.#events = this.#events.slice(this.#events.length - this.#capacity);
    }

    for (const handler of [...this.#listeners]) {
      await handler(enriched);
    }
  }

  toTimeline(): readonly TraceEnvelope<TPayload>[] {
    return this.#events.toSorted((left, right) => left.at - right.at).map((entry) => entry.event);
  }

  toSnapshot(): TraceBusSnapshot {
    return {
      at: new Date().toISOString(),
      scope: this.#scope,
      route: this.#route,
      events: this.toTimeline(),
    };
  }

  digest(): TraceDigest[] {
    const grouped = new Map<string, { scope: TraceScope; route: TraceRoute; count: number; at: number[] }>();
    for (const entry of this.#events) {
      const key = `${entry.event.scope}::${entry.event.route}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.at.push(entry.at);
      } else {
        grouped.set(key, {
          scope: entry.event.scope,
          route: entry.event.route,
          count: 1,
          at: [entry.at],
        });
      }
    }
    return [...grouped.values()].map((entry) => ({
      scope: entry.scope,
      route: entry.route,
      count: entry.count,
      firstSeen: entry.at.length > 0 ? new Date(Math.min(...entry.at)).toISOString() : null,
      lastSeen: entry.at.length > 0 ? new Date(Math.max(...entry.at)).toISOString() : null,
    }));
  }

  clear(): void {
    this.#events.length = 0;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    this.#listeners.clear();
    this.#events.length = 0;
    return Promise.resolve();
  }
}

export const collectBusEvents = async <TPayload extends Record<string, unknown>>(
  bus: IntelligenceTraceBus<TPayload>,
): Promise<TraceDigest[]> => {
  return bus.digest();
};

export interface TraceRunResult {
  readonly route: TraceRoute;
  readonly scope: TraceScope;
  readonly events: readonly TraceEnvelope[];
}

export const runWithTraceBus = async <TResult>(
  route: TraceRoute,
  scope: TraceScope,
  callback: (bus: IntelligenceTraceBus<Record<string, unknown>>) => Promise<TResult>,
): Promise<TraceRunResult> => {
  const stackCtor = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStackLike }).AsyncDisposableStack;

  const runResult: TraceRunResult = {
    route,
    scope,
    events: [],
  };

  if (!stackCtor) {
    const bus = new IntelligenceTraceBus({ scope, route, capacity: 128 });
    try {
      await callback(bus);
      return { ...runResult, events: bus.toTimeline() };
    } finally {
      await bus[Symbol.asyncDispose]();
    }
  }

  const stack = new stackCtor();
  try {
    const bus = new IntelligenceTraceBus({ scope, route, capacity: 128 });
    stack.use(bus);
    await callback(bus);
    return { ...runResult, events: bus.toTimeline() };
  } finally {
    await stack.disposeAsync();
  }
};
