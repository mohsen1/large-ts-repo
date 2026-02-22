import { Metric } from './telemetry';

export interface EventBus {
  publish(event: Metric): void;
}

export interface EventSummary {
  name: string;
  count: number;
  latest: number;
}

export class MemoryEventBus implements EventBus {
  private readonly events: Metric[] = [];
  publish(event: Metric): void { this.events.push(event); }
  drain(): Metric[] {
    const next = [...this.events];
    this.events.length = 0;
    return next;
  }
}

export function summarize(events: readonly Metric[]): EventSummary[] {
  const map = new Map<string, EventSummary>();
  for (const event of events) {
    const next = map.get(event.name);
    if (!next) {
      map.set(event.name, { name: event.name, count: 1, latest: event.value });
    } else {
      next.count += 1;
      next.latest = event.value;
    }
  }
  return [...map.values()];
}
