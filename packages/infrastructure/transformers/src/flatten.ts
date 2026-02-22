export function flattenArray<T>(input: readonly (T | readonly T[])[]): T[] {
  const out: T[] = [];
  for (const item of input) {
    if (Array.isArray(item)) {
      out.push(...flattenArray(item as readonly (T | readonly T[])[]));
    } else {
      out.push(item as T);
    }
  }
  return out;
}

export function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenObject(value as Record<string, unknown>, next));
    } else {
      out[next] = value;
    }
  }
  return out;
}

export function flattenPath(path: string): string[] {
  const parts = path.split('.');
  return parts.filter(Boolean);
}
