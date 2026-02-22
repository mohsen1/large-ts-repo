export interface Signal {
  id: string;
  source: string;
  value: number;
  tags: Record<string, string>;
}

export interface SignalEngine {
  record(signal: Signal): void;
  query(tag: string, value: string): Signal[];
  score(signal: Signal): number;
}

export class BasicSignalEngine implements SignalEngine {
  private signals: Signal[] = [];

  record(signal: Signal): void {
    this.signals.push(signal);
  }

  query(tag: string, value: string): Signal[] {
    return this.signals.filter((signal) => signal.tags[tag] === value);
  }

  score(signal: Signal): number {
    const bySource = this.signals.filter((item) => item.source === signal.source);
    const avg = bySource.reduce((acc, item) => acc + item.value, 0) / Math.max(1, bySource.length);
    return (signal.value - avg) / Math.max(1, Math.abs(avg));
  }
}
