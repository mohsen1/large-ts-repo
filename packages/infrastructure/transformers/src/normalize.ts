export interface Normalizer<T> {
  normalize(value: T): T;
}

export class IdentityNormalizer<T> implements Normalizer<T> {
  normalize(value: T): T { return value; }
}

export class TrimNormalizer implements Normalizer<string> {
  normalize(value: string): string { return value.trim().toLowerCase(); }
}

export class NumberNormalizer implements Normalizer<number> {
  normalize(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Number.isFinite(value) ? value : 0;
  }
}

export function normalizeMap<T>(items: readonly T[], normalizer: Normalizer<T>): T[] {
  return items.map((item) => normalizer.normalize(item));
}

export function normalizeKV(value: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const normalizer = new TrimNormalizer();
  for (const [key, raw] of Object.entries(value)) {
    out[key.toLowerCase()] = normalizer.normalize(raw);
  }
  return out;
}
