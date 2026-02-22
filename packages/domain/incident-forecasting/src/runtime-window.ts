import { z } from 'zod';

export const WindowType = z.enum(['minute', 'hour', 'day', 'incident']);

export type WindowType = z.infer<typeof WindowType>;

export interface RuntimeWindow {
  readonly type: WindowType;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly overlapPolicy: 'replace' | 'merge' | 'accumulate';
}

export const sortWindowsByStart = (windows: readonly RuntimeWindow[]): RuntimeWindow[] => {
  return [...windows].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
};

export const validateWindowChronology = (windows: readonly RuntimeWindow[]): boolean => {
  if (windows.length <= 1) {
    return true;
  }
  const ordered = sortWindowsByStart(windows);
  for (let i = 1; i < ordered.length; i += 1) {
    if (Date.parse(ordered[i].startedAt) < Date.parse(ordered[i - 1].endedAt)) {
      return false;
    }
  }
  return true;
};

export const overlapMinutes = (left: RuntimeWindow, right: RuntimeWindow): number => {
  const end = Math.min(Date.parse(left.endedAt), Date.parse(right.endedAt));
  const start = Math.max(Date.parse(left.startedAt), Date.parse(right.startedAt));
  const diff = end - start;
  return Math.max(0, Math.floor(diff / 60000));
};
