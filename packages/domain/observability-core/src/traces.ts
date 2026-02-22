export type SpanId = string;
export type TraceId = string;

export interface TraceContext {
  traceId: TraceId;
  spanId: SpanId;
  parentSpanId?: SpanId;
}

export interface SpanEvent {
  id: SpanId;
  name: string;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface TraceSpan {
  context: TraceContext;
  name: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, string>;
  events: SpanEvent[];
  children: TraceSpan[];
}

export interface Trace {
  id: TraceId;
  root: TraceSpan;
}

export class Tracer {
  private readonly spans: Map<SpanId, TraceSpan> = new Map();
  private readonly traces: Map<TraceId, TraceSpan> = new Map();

  constructor(private readonly now: () => number = () => Date.now()) {}

  startTrace(id: TraceId, name: string): TraceSpan {
    const span: TraceSpan = {
      context: { traceId: id, spanId: `${id}-${Date.now()}-root` },
      name,
      startTime: this.now(),
      tags: {},
      events: [],
      children: [],
    };
    this.spans.set(span.context.spanId, span);
    this.traces.set(id, span);
    return span;
  }

  startSpan(parent: TraceSpan, name: string): TraceSpan {
    const child: TraceSpan = {
      context: {
        traceId: parent.context.traceId,
        spanId: `${parent.context.traceId}-${parent.children.length + 1}`,
        parentSpanId: parent.context.spanId,
      },
      name,
      startTime: this.now(),
      tags: {},
      events: [],
      children: [],
    };
    parent.children.push(child);
    this.spans.set(child.context.spanId, child);
    return child;
  }

  annotate(span: TraceSpan, key: string, value: string): void {
    span.tags[key] = value;
  }

  addEvent(span: TraceSpan, type: string, payload: Record<string, unknown>): void {
    span.events.push({ id: `${span.context.spanId}-e`, name: type, timestamp: this.now(), type, payload });
  }

  finish(span: TraceSpan): void {
    span.endTime = this.now();
  }

  getTrace(id: TraceId): TraceSpan | undefined {
    return this.traces.get(id);
  }

  walk(span: TraceSpan, visit: (span: TraceSpan, depth: number) => void): void {
    const stack: Array<{ span: TraceSpan; depth: number }> = [{ span, depth: 0 }];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) break;
      visit(node.span, node.depth);
      for (const child of node.span.children) {
        stack.push({ span: child, depth: node.depth + 1 });
      }
    }
  }
}
