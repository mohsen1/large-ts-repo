export type Vector = readonly number[];

export function vectorize(input: string): Vector {
  const buckets = new Array(26).fill(0);
  for (const ch of input.toLowerCase()) {
    const idx = ch.charCodeAt(0) - 97;
    if (idx >= 0 && idx < 26) buckets[idx] += 1;
  }
  return buckets;
}

export function cosineDistance(a: Vector, b: Vector): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    denA += a[i] * a[i];
    denB += b[i] * b[i];
  }
  return dot / (Math.sqrt(denA) * Math.sqrt(denB));
}

export function toTokens(v: Vector): string {
  return v.map((value) => value.toFixed(3)).join(',');
}

export function merge(a: Vector, b: Vector): Vector {
  const n = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push((a[i] ?? 0) + (b[i] ?? 0));
  }
  return out;
}
