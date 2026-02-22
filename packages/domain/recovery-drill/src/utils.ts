export const parseISODate = (value: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`invalid-date:${value}`);
  return parsed;
};

export const safePercent = (part: number, total: number, fallback = 0): number => {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return fallback;
  return Math.round((part / total) * 1000) / 10;
};

export const normalizeSecondsLimit = (value: number | undefined, fallback = 5): number => {
  if (!Number.isFinite(value as number)) return fallback;
  return Math.max(1, Math.min(120, Math.floor(value as number)));
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
