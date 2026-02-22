export function mergeAll<T>(left: T, right: T, preferRight = true): T {
  const out: Record<string, unknown> = { ...(left as object), ...(right as object) };
  if (!preferRight) {
    return { ...(right as object), ...(left as object) } as T;
  }
  return out as T;
}

export function mergeMany<T>(base: T, ...values: T[]): T {
  let out: T = base;
  for (const value of values) {
    out = mergeAll(out, value, true);
  }
  return out;
}

export function dedupe<T>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
