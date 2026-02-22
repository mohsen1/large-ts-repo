import { Fact, FactTimeline, FactEvent } from './schema';

export interface Diff {
  previous: Fact | undefined;
  current: Fact;
}

export class TimelineStore {
  private readonly histories = new Map<string, FactTimeline>();

  upsert(event: FactEvent, fact: Fact): void {
    const current = this.histories.get(event.factId) ?? { fact, events: [] };
    current.fact = fact;
    current.events.push(event);
    this.histories.set(event.factId, current);
  }

  get(factId: string): FactTimeline | undefined {
    return this.histories.get(factId);
  }

  events(): FactEvent[] {
    const out: FactEvent[] = [];
    for (const timeline of this.histories.values()) {
      out.push(...timeline.events);
    }
    return out;
  }
}

export function diffFact(old: Fact | undefined, next: Fact): Diff {
  return { previous: old, current: next };
}

export function changes(timelines: readonly FactTimeline[]): number {
  return timelines.reduce((acc, timeline) => acc + timeline.events.length, 0);
}
