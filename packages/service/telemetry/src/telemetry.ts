export interface Metric {
  name: string;
  value: number;
  tags: Record<string, string>;
  at: Date;
}

export interface Counter {
  name: string;
  increment(labels?: Record<string, string>): void;
  get(): number;
}

export class InMemoryCounter implements Counter {
  private value = 0;
  constructor(public readonly name: string, private readonly labels?: Record<string, string>) {}
  increment(): void { this.value += 1; }
  get(): number { return this.value; }
}

export class Gauge {
  private value = 0;
  constructor(public readonly name: string) {}
  set(value: number): void { this.value = value; }
  add(delta: number): void { this.value += delta; }
  get(): number { return this.value; }
}

export class Span {
  private readonly start = Date.now();
  constructor(public readonly id: string, public readonly operation: string) {}
  end(): Metric {
    return { name: 'span_ms', value: Date.now() - this.start, tags: { operation: this.operation, id: this.id }, at: new Date() };
  }
}

export function counter(name: string): Counter {
  return new InMemoryCounter(name);
}
