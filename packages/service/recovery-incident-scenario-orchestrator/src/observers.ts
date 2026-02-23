import type { ServiceEvent } from './types';

export type ScenarioObserver = (event: ServiceEvent) => void;

export class InMemoryScenarioObserverBus {
  private readonly listeners: Map<string, Set<ScenarioObserver>>;

  constructor() {
    this.listeners = new Map();
  }

  subscribe(scope: string, listener: ScenarioObserver): () => void {
    const normalized = scope.toLowerCase();
    const current = this.listeners.get(normalized) ?? new Set<ScenarioObserver>();
    current.add(listener);
    this.listeners.set(normalized, current);

    return () => {
      const maybe = this.listeners.get(normalized);
      if (!maybe) {
        return;
      }
      maybe.delete(listener);
      if (maybe.size === 0) {
        this.listeners.delete(normalized);
      }
    };
  }

  publish(scope: string, event: ServiceEvent): number {
    const target = this.listeners.get(scope.toLowerCase());
    if (!target || target.size === 0) {
      return 0;
    }

    for (const listener of target) {
      try {
        listener(event);
      } catch {
        // intentionally ignore observer errors so one listener cannot block the rest
      }
    }
    return target.size;
  }

  publishToAll(event: ServiceEvent): number {
    let total = 0;
    for (const scope of this.listeners.keys()) {
      total += this.publish(scope, event);
    }
    return total;
  }
}

export const createDefaultObserverBus = (): InMemoryScenarioObserverBus => new InMemoryScenarioObserverBus();
