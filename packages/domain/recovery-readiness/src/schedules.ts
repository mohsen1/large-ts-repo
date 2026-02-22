export interface TimeWindow {
  startUtc: string;
  endUtc: string;
  owner: string;
  capacity: number;
}

export interface TimeSpan {
  from: number;
  to: number;
}

function parseUtc(date: string): number {
  return Date.parse(date);
}

export function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  return Math.max(a.from, b.from) < Math.min(a.to, b.to);
}

export function orderByStart(windows: TimeWindow[]): TimeWindow[] {
  return [...windows].sort((left, right) => parseUtc(left.startUtc) - parseUtc(right.startUtc));
}

export function detectOverlaps(windows: TimeWindow[]): Array<{ windowA: TimeWindow; windowB: TimeWindow }> {
  const sorted = orderByStart(windows);
  const spans = sorted.map((window) => ({
    window,
    span: {
      from: parseUtc(window.startUtc),
      to: parseUtc(window.endUtc)
    }
  }));

  const overlapsOut: Array<{ windowA: TimeWindow; windowB: TimeWindow }> = [];
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      const current = spans[i];
      const next = spans[j];
      if (overlaps(current.span, next.span)) {
        overlapsOut.push({
          windowA: current.window,
          windowB: next.window
        });
      }
    }
  }

  return overlapsOut;
}

export function normalizeWindow(window: Omit<TimeWindow, 'startUtc' | 'endUtc'> & { start: Date; end: Date }): TimeWindow {
  return {
    startUtc: window.start.toISOString(),
    endUtc: window.end.toISOString(),
    owner: window.owner,
    capacity: window.capacity
  };
}

export function remainingCapacity(window: TimeWindow): number {
  const span = parseUtc(window.endUtc) - parseUtc(window.startUtc);
  const minutes = span / (1000 * 60);
  return Math.max(0, window.capacity - minutes);
}

export function calculateWindowDensity(windows: readonly TimeWindow[]): number {
  if (windows.length === 0) {
    return 0;
  }

  const totalCapacity = windows.reduce((sum, window) => sum + window.capacity, 0);
  const projectedUsed = windows.reduce((sum, window) => {
    const span = Math.max(0, parseUtc(window.endUtc) - parseUtc(window.startUtc));
    const minutes = span / (1000 * 60);
    return sum + Math.min(window.capacity, minutes);
  }, 0);

  if (totalCapacity === 0) {
    return 0;
  }

  return Number((projectedUsed / totalCapacity).toFixed(3));
}

export function estimateRecoveryCapacity(windows: readonly TimeWindow[]): number {
  if (windows.length === 0) {
    return 0;
  }

  return windows.reduce((sum, window) => sum + Math.max(0, remainingCapacity(window)), 0);
}

export function isAlignedWindow(window: TimeWindow, cursor: Date): boolean {
  const start = parseUtc(window.startUtc);
  const end = parseUtc(window.endUtc);
  const cursorTs = cursor.getTime();
  return cursorTs >= start && cursorTs <= end;
}
