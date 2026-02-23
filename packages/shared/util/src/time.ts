import { clamp } from './aggregates';

export type TimeWindow = {
  readonly start: Date;
  readonly end: Date;
  readonly label: string;
};

export type WindowPoint = {
  readonly at: Date;
  readonly value: number;
};

export const msPerMinute = 60 * 1000;

export const addMinutes = (value: Date, minutes: number): Date => new Date(value.getTime() + minutes * msPerMinute);

export const floorToMinute = (value: Date): Date => new Date(Math.floor(value.getTime() / msPerMinute) * msPerMinute);

export const ceilToMinute = (value: Date): Date => new Date(Math.ceil(value.getTime() / msPerMinute) * msPerMinute);

export const isWithinWindow = (value: Date, window: TimeWindow): boolean => {
  const time = value.getTime();
  return time >= window.start.getTime() && time <= window.end.getTime();
};

export const parseDate = (value: string | number | Date): Date => {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(value);
};

export const toEpochMinutes = (value: Date): number => Math.floor(value.getTime() / msPerMinute);

export const toRfc3339 = (value: Date): string => value.toISOString();

export const buildMinutes = (from: Date, to: Date): readonly number[] => {
  const start = toEpochMinutes(ceilToMinute(from));
  const end = toEpochMinutes(floorToMinute(to));
  const result: number[] = [];
  for (let minute = start; minute <= end; minute += 1) {
    result.push(minute);
  }
  return result;
};

export const buildTimeWindows = (anchor: Date, spanMinutes: number, sizeMinutes: number): readonly TimeWindow[] => {
  if (spanMinutes <= 0 || sizeMinutes <= 0) {
    return [];
  }

  const windows: TimeWindow[] = [];
  const maxIndex = Math.floor(spanMinutes / sizeMinutes);
  for (let index = 0; index <= maxIndex; index += 1) {
    const start = addMinutes(anchor, index * sizeMinutes);
    const end = addMinutes(start, sizeMinutes);
    windows.push({
      start,
      end,
      label: `${index.toString().padStart(3, '0')}:${sizeMinutes}m`,
    });
  }
  return windows;
};

export const sampleSeries = (points: readonly WindowPoint[], windows: readonly TimeWindow[]): readonly WindowPoint[] => {
  return windows.map((window) => {
    const values = points
      .filter((point) => isWithinWindow(point.at, window))
      .map((point) => point.value);

    if (values.length === 0) {
      return { at: window.start, value: 0 };
    }

    const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
    return { at: window.start, value: clamp(avg, 0, 100) };
  });
};

export const mergeSeries = (left: readonly WindowPoint[], right: readonly WindowPoint[]): readonly WindowPoint[] => {
  const byTimestamp = new Map<number, WindowPoint>();
  for (const item of [...left, ...right]) {
    const key = item.at.getTime();
    const prev = byTimestamp.get(key);
    if (!prev) {
      byTimestamp.set(key, item);
      continue;
    }
    byTimestamp.set(key, {
      at: new Date(key),
      value: (prev.value + item.value) / 2,
    });
  }

  return [...byTimestamp.entries()]
    .sort((leftEntry, rightEntry) => leftEntry[0] - rightEntry[0])
    .map((entry) => ({ at: new Date(entry[0]), value: Number(entry[1].value.toFixed(4)) }));
};

export const humanWindowLabel = (window: TimeWindow): string => {
  return `${toRfc3339(window.start)} → ${toRfc3339(window.end)}`;
};
