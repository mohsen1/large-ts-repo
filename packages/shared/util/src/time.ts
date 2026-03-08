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
  switch (true) {
    case value instanceof Date:
      return new Date(value.getTime());
    case typeof value === 'string':
    case typeof value === 'number':
      return new Date(value);
    default: {
      const exhaustive: never = value;
      return new Date(exhaustive);
    }
  }
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
  return Array.from(
    Map.groupBy([...left, ...right], (item) => item.at.getTime()).entries(),
  )
    .toSorted((leftEntry, rightEntry) => leftEntry[0] - rightEntry[0])
    .map(([timestamp, points]) => {
      const avg = points.reduce((total, point) => total + point.value, 0) / points.length;
      return { at: new Date(timestamp), value: Number(avg.toFixed(4)) };
    });
};

export const humanWindowLabel = (window: TimeWindow): string => {
  return `${toRfc3339(window.start)} → ${toRfc3339(window.end)}`;
};
