export interface Span {
  id: string;
  parent?: string;
  name: string;
  start: number;
  end?: number;
  attributes: Record<string, string | number | boolean>;
}

export class Tracer {
  private readonly spans: Span[] = [];

  start(name: string, parent?: string): Span {
    const span: Span = { id: `span-${this.spans.length + 1}`, parent, name, start: Date.now(), attributes: {} };
    this.spans.push(span);
    return span;
  }

  end(span: Span): Span {
    span.end = Date.now();
    return span;
  }

  annotate(span: Span, key: string, value: string | number | boolean): Span {
    span.attributes[key] = value;
    return span;
  }

  snapshot(): readonly Span[] {
    return this.spans;
  }
}

export const measure = async <T>(tracer: Tracer, name: string, run: () => Promise<T>): Promise<T> => {
  const span = tracer.start(name);
  try {
    return await run();
  } finally {
    tracer.end(span);
  }
};
