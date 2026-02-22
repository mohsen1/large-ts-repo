export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

export const uniqueBy = <T>(items: readonly T[], key: (value: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const name = key(item);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(item);
  }
  return out;
};

export const sortByCreatedAt = (left: string, right: string): number => {
  return Date.parse(left) - Date.parse(right);
};
