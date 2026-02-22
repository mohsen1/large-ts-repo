import { Timestamp, toDate, fromDate } from './clock';

export interface TimeWindow {
  start: Timestamp;
  end: Timestamp;
}

export interface WindowEvent<T> {
  at: Timestamp;
  value: T;
}

export function contains(window: TimeWindow, point: Timestamp): boolean {
  return point.epochMs >= window.start.epochMs && point.epochMs <= window.end.epochMs;
}

export function overlap(a: TimeWindow, b: TimeWindow): boolean {
  return contains(a, b.start) || contains(a, b.end) || contains(b, a.start);
}

export function width(window: TimeWindow): number {
  return window.end.epochMs - window.start.epochMs;
}

export function move(window: TimeWindow, deltaMs: number): TimeWindow {
  return { start: { epochMs: window.start.epochMs + deltaMs }, end: { epochMs: window.end.epochMs + deltaMs } };
}

export function bucket<T>(events: readonly WindowEvent<T>[], window: TimeWindow): Map<string, WindowEvent<T>[]> {
  const out = new Map<string, WindowEvent<T>[]>();
  for (const event of events) {
    if (!contains(window, event.at)) continue;
    const key = toDate(event.at).toISOString().slice(0, 13);
    const bucket = out.get(key) ?? [];
    bucket.push(event);
    out.set(key, bucket);
  }
  return out;
}

export function fromRange(start: Date, end: Date): TimeWindow {
  return { start: fromDate(start), end: fromDate(end) };
}
