export interface Span {
  traceId: string;
  parentId?: string;
  attributes: Record<string, unknown>;
}

export interface TelemetryCollector {
  start(spanName: string): Span;
  end(span: Span): Promise<void>;
  mark(span: Span, key: string, value: unknown): void;
}

export class NullTelemetry implements TelemetryCollector {
  start(spanName: string): Span {
    return { traceId: `${spanName}:${Date.now()}`, attributes: {} };
  }

  async end(span: Span): Promise<void> {
    await Promise.resolve(span.traceId);
  }

  mark(span: Span, key: string, value: unknown): void {
    span.attributes[key] = value;
  }
}

export class AggregatingTelemetry implements TelemetryCollector {
  private readonly queue: Span[] = [];
  start(spanName: string): Span {
    const span = { traceId: `${spanName}:${Date.now()}`, attributes: {} };
    this.queue.push(span);
    return span;
  }

  async end(span: Span): Promise<void> {
    await Promise.resolve(span.attributes);
    const idx = this.queue.indexOf(span);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  mark(span: Span, key: string, value: unknown): void {
    span.attributes[key] = value;
  }

  snapshot(): readonly Span[] {
    return [...this.queue];
  }
}
