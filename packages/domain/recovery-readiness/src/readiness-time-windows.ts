import type { ReadinessTarget, ReadinessDirective, ReadinessWindow, ReadinessRunId, ReadinessSignal, RecoveryReadinessPlan } from './types';

export interface TimeWindow {
  key: string;
  startUtc: string;
  endUtc: string;
}

export interface TimeBucket {
  key: string;
  sizeMinutes: number;
  signals: ReadinessSignal[];
  density: number;
}

export interface ReadinessCapacityForecast {
  runId: ReadinessRunId;
  capacityBuckets: readonly TimeBucket[];
  capacitySlack: number;
  maxConcurrent: number;
  recommendedWindow: ReadinessWindow;
  projectedRisk: 'low' | 'medium' | 'high' | 'critical';
}

export interface WindowBoundary {
  startedAt: Date;
  endedAt: Date;
}

const toUtc = (value: string | number | Date): string => new Date(value).toISOString();

const asDate = (value: string): Date => new Date(value);

export const normalizeWindow = (window: ReadinessWindow): TimeWindow => ({
  key: `${window.windowId}`,
  startUtc: toUtc(window.fromUtc),
  endUtc: toUtc(window.toUtc),
});

export const clampWindow = (window: ReadinessWindow, lowerBoundMinutes = 15, upperBoundMinutes = 240): ReadinessWindow => {
  const start = asDate(window.fromUtc);
  const end = asDate(window.toUtc);
  const durationMinutes = Math.max(lowerBoundMinutes, Math.min((end.getTime() - start.getTime()) / 60_000, upperBoundMinutes));
  const clampedEnd = new Date(start.getTime() + durationMinutes * 60_000);

  return {
    ...window,
    fromUtc: toUtc(start),
    toUtc: toUtc(clampedEnd),
  };
};

export const splitWindow = (window: ReadinessWindow, chunkMinutes: number): ReadinessWindow[] => {
  const normalized = normalizeWindow(window);
  const segments: ReadinessWindow[] = [];
  const start = asDate(normalized.startUtc);
  const end = asDate(normalized.endUtc);
  const chunk = Math.max(1, Math.floor(chunkMinutes));
  let cursor = start.getTime();

  while (cursor < end.getTime()) {
    const segmentEnd = Math.min(cursor + chunk * 60_000, end.getTime());
    segments.push({
      windowId: `${window.windowId}:${segments.length}` as ReadinessWindow['windowId'],
      label: `${window.label}#${segments.length}`,
      fromUtc: toUtc(cursor),
      toUtc: toUtc(segmentEnd),
      timezone: window.timezone,
    });
    cursor = segmentEnd;
  }

  return segments;
};

export const buildSignalBuckets = (
  signals: readonly ReadinessSignal[],
  sizeMinutes = 15,
): ReadonlyArray<TimeBucket> => {
  if (!signals.length) return [];
  const sorted = [...signals].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const buckets = new Map<string, TimeBucket>();

  for (const signal of sorted) {
    const base = new Date(signal.capturedAt).getTime();
    const bucketFloor = Math.floor(base / (sizeMinutes * 60_000)) * (sizeMinutes * 60_000);
    const key = `${sizeMinutes}-${bucketFloor}`;
    const current = buckets.get(key);
    const severityScore = signal.severity === 'critical' ? 3 : signal.severity === 'high' ? 2 : signal.severity === 'medium' ? 1 : 0.25;

    if (!current) {
      buckets.set(key, {
        key,
        sizeMinutes,
        signals: [signal],
        density: severityScore,
      });
      continue;
    }

    current.signals.push(signal);
    current.density += severityScore;
  }

  return Array.from(buckets.values()).map((entry) => ({
    ...entry,
    density: Number(entry.density.toFixed(2)),
  }));
};

export const estimateWindowCapacity = (
  directives: readonly ReadinessDirective[],
  windows: readonly ReadinessWindow[],
): ReadonlyArray<ReadinessCapacityForecast> => {
  return windows.map((window) => {
    const normalized = normalizeWindow(window);
    const minutes = Math.max(1, (new Date(normalized.endUtc).getTime() - new Date(normalized.startUtc).getTime()) / 60_000);
    const directiveCount = Math.max(1, directives.length);
    const capacitySlack = Number((minutes / directiveCount).toFixed(2));
    const maxConcurrent = Math.max(1, Math.min(12, Math.round(capacitySlack / 3)));

    return {
      runId: `window:${window.windowId}` as ReadinessRunId,
      capacityBuckets: [
        {
          key: `bucket:${window.windowId}`,
          sizeMinutes: window.toUtc ? minutes : 15,
          signals: [],
          density: capacitySlack,
        },
      ],
      capacitySlack,
      maxConcurrent,
      recommendedWindow: {
        windowId: `${window.windowId}:recommended` as ReadinessWindow['windowId'],
        label: `${window.label} recommended`,
        fromUtc: normalized.startUtc,
        toUtc: normalized.endUtc,
        timezone: window.timezone,
      },
      projectedRisk: capacitySlack < 2 ? 'high' : capacitySlack < 6 ? 'medium' : 'low',
    };
  });
};

export const overlapsAny = (plan: RecoveryReadinessPlan, windows: readonly ReadinessWindow[]): ReadinessWindow[] => {
  const overlapSet = new Set<ReadinessWindow['windowId']>();

  const intersects = (outer: ReadinessWindow, inner: ReadinessWindow): boolean => {
    const outerFrom = new Date(outer.fromUtc).getTime();
    const outerTo = new Date(outer.toUtc).getTime();
    const innerFrom = new Date(inner.fromUtc).getTime();
    const innerTo = new Date(inner.toUtc).getTime();
    return !(outerTo < innerFrom || innerTo < outerFrom);
  };

  for (const candidate of windows) {
    if (plan.windows.some((window) => intersects(window, candidate))) {
      overlapSet.add(candidate.windowId);
    }
  }

  return windows.filter((window) => overlapSet.has(window.windowId));
};

export const computeWindowCoverage = (plan: RecoveryReadinessPlan): number => {
  const totalMinutes = plan.windows.reduce((total, window) => {
    const start = new Date(window.fromUtc).getTime();
    const end = new Date(window.toUtc).getTime();
    return total + Math.max(0, (end - start) / 60_000);
  }, 0);

  const targetCount = Math.max(1, plan.targets.length);
  return Number((totalMinutes / targetCount).toFixed(2));
};

export const deriveWindowBoundary = (targetCoverageMinutes: number, signalDensity: number): WindowBoundary => {
  const now = Date.now();
  return {
    startedAt: new Date(now),
    endedAt: new Date(now + Math.max(targetCoverageMinutes, signalDensity * 4) * 60_000),
  };
};

export const isWithinWindow = (target: ReadinessTarget, signal: ReadinessSignal, boundaries: WindowBoundary[]): boolean => {
  const captured = new Date(signal.capturedAt).getTime();
  return boundaries.some((boundary) => captured >= boundary.startedAt.getTime() && captured <= boundary.endedAt.getTime());
};
