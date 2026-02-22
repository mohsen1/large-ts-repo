import type { CommandWindow, TimelineBucket, WindowId } from './types';

export interface TimelineConfig {
  bucketMinutes: number;
  minDemand: number;
}

export interface WindowBuckets {
  windowId: WindowId;
  buckets: readonly TimelineBucket[];
}

const toBucketIndex = (iso: string, origin: number, bucketMinutes: number): number => {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return 0;
  const elapsed = Math.max(0, value - origin);
  return Math.floor(elapsed / (bucketMinutes * 60_000));
};

export const buildTimeline = (windows: readonly CommandWindow[], config: TimelineConfig): readonly WindowBuckets[] => {
  if (windows.length === 0) return [];

  const ordered = [...windows].sort((left, right) => {
    const leftStart = Date.parse(left.startsAt);
    const rightStart = Date.parse(right.startsAt);
    if (leftStart < rightStart) return -1;
    if (leftStart > rightStart) return 1;
    return Date.parse(left.endsAt) - Date.parse(right.endsAt);
  });

  const earliest = ordered[0]?.startsAt ?? new Date().toISOString();
  const latestEnd = ordered.reduce((acc, current) => {
    const currentEnd = Date.parse(current.endsAt);
    return Number.isFinite(currentEnd) ? Math.max(acc, currentEnd) : acc;
  }, Date.parse(earliest));

  const bucketsByWindow: WindowBuckets[] = [];

  for (const window of windows) {
    const start = Date.parse(window.startsAt);
    const end = Date.parse(window.endsAt);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || Number.isNaN(latestEnd)) {
      bucketsByWindow.push({ windowId: window.id, buckets: [] });
      continue;
    }

    const totalBuckets = Math.max(1, Math.ceil((latestEnd - start) / (config.bucketMinutes * 60_000)));
    const startIndex = toBucketIndex(window.startsAt, Date.parse(earliest), config.bucketMinutes);
    const endIndex = toBucketIndex(window.endsAt, Date.parse(earliest), config.bucketMinutes);

    const buckets: TimelineBucket[] = [];
    for (let index = 0; index <= totalBuckets; index += 1) {
      const bucketMinute = Date.parse(earliest) + index * config.bucketMinutes * 60_000;
      const bucketAt = new Date(bucketMinute).toISOString();
      const overlapStart = Math.max(start, bucketMinute);
      const overlapEnd = Math.min(end, bucketMinute + config.bucketMinutes * 60_000);
      const demand = overlapStart < overlapEnd ? window.maxConcurrent : config.minDemand;
      const capacity = window.maxConcurrent;
      buckets.push({
        bucketAt,
        windowId: window.id,
        demand,
        capacity,
        saturated: demand >= capacity,
      });

      if (index < startIndex - 1 || index > endIndex + 1) {
        buckets[buckets.length - 1] = {
          bucketAt,
          windowId: window.id,
          demand: config.minDemand,
          capacity,
          saturated: false,
        };
      }
    }

    bucketsByWindow.push({ windowId: window.id, buckets });
  }

  return bucketsByWindow;
};

export const aggregateDemand = (buckets: readonly WindowBuckets[]): number => {
  return buckets.reduce((sum, entry) => {
    const maxDemand = entry.buckets.reduce((m, bucket) => Math.max(m, bucket.demand), 0);
    return sum + maxDemand;
  }, 0);
};

export const topSaturation = (buckets: readonly WindowBuckets[], limit = 3): readonly TimelineBucket[] => {
  const merged = buckets.flatMap((entry) => entry.buckets);
  return merged
    .filter((bucket) => bucket.saturated)
    .sort((left, right) => {
      if (right.demand === left.demand) {
        return Date.parse(right.bucketAt) - Date.parse(left.bucketAt);
      }
      return right.demand - left.demand;
    })
    .slice(0, limit);
};
