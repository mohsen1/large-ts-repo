import { iteratorChain, type IteratorHelpers } from './iterator-utils';

export type WorkbenchMetric<TValue = unknown> = {
  readonly route: string;
  readonly name: string;
  readonly value: number;
  readonly dimensions: Readonly<Record<string, string>>;
  readonly createdAt: number;
  readonly payload?: TValue;
};

export type WorkbenchTelemetryObserver = (metric: WorkbenchMetric) => void;

export interface WorkbenchTelemetryWindow {
  readonly startedAt: number;
  readonly route: string;
  readonly count: number;
}

export class WorkbenchTelemetryBus {
  readonly #observers: Set<WorkbenchTelemetryObserver> = new Set();
  readonly #history: WorkbenchMetric[] = [];

  add(observer: WorkbenchTelemetryObserver): () => void {
    this.#observers.add(observer);
    return () => {
      this.#observers.delete(observer);
    };
  }

  record<TPayload>(metric: Omit<WorkbenchMetric<TPayload>, 'createdAt'>): void {
    const payload = {
      ...metric,
      createdAt: Date.now(),
    } satisfies WorkbenchMetric<TPayload>;
    this.#history.push(payload);

    for (const observer of this.#observers) {
      observer(payload);
    }
  }

  window(route: string, fromMs = 0): WorkbenchTelemetryWindow {
    const routeHistory = iteratorChain(this.#history)
      .filter((metric) => metric.route === route)
      .filter((metric) => metric.createdAt >= fromMs);

    return {
      startedAt: fromMs,
      route,
      count: routeHistory.length,
    };
  }

  dump(): readonly WorkbenchMetric[] {
    return [...this.#history];
  }

  topRoutes(limit = 3): readonly [string, number][] {
    const groups = new Map<string, number>();

    for (const metric of this.#history) {
      groups.set(metric.route, (groups.get(metric.route) ?? 0) + 1);
    }

    return iteratorChain(groups.entries())
      .map(([route, count]) => [route, count] as const)
      .take(limit)
      .toArray() as readonly [string, number][];
  }

  summarizeRoutes(): Readonly<Record<string, number>> {
    return this.topRoutes(Number.MAX_SAFE_INTEGER).reduce<Record<string, number>>((accumulator, [route, count]) => {
      accumulator[route] = count;
      return accumulator;
    }, {});
  }

  drain(): IteratorHelpers<WorkbenchMetric> {
    return iteratorChain(this.#history);
  }

  drainWindow(route: string, fromMs: number): IteratorHelpers<WorkbenchMetric> {
    return iteratorChain(this.#history).filter((metric) => metric.route === route).filter((metric) => metric.createdAt >= fromMs);
  }

  trend(route: string, windowMs: number): readonly WorkbenchMetric[] {
    const fromMs = Date.now() - windowMs;
    return iteratorChain(this.drainWindow(route, fromMs)).toArray().slice(0, 16);
  }
}

export const makeMetricTag = (key: string, value: string): string => `${key}=${value}`;

export const summarizeRoutes = (routeMetrics: readonly [string, number][]): Readonly<Record<string, number>> => {
  return routeMetrics.reduce<Record<string, number>>((result, [route, count]) => {
    result[route] = count;
    return result;
  }, {});
};
