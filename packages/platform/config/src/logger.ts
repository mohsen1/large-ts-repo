export interface ConfigValue<T> {
  key: string;
  value: T;
}

export function readEnvBoolean(key: string, defaultValue = false): boolean {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
}

export function readEnvInt(key: string, defaultValue = 0): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    out[key] = value[key];
  }
  return out;
}
