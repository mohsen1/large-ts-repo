import { fromPromise } from '@shared/result';
import { z } from 'zod';
import { createValidator } from '@shared/validation';

export interface ServiceEnv {
  NODE_ENV: 'development' | 'staging' | 'production';
  PORT: number;
  DATABASE_URL: string;
  AWS_REGION?: string;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().int().min(1000).max(65535),
  DATABASE_URL: z.string().url(),
  AWS_REGION: z.string().optional(),
});

export const parseEnv = createValidator(schema);

export const loadEnvironment = () =>
  fromPromise(Promise.resolve(parseEnv.parse(process.env)).then((value) => {
    if (!value.ok) throw value.error;
    return value.value;
  }));

export const normalize = (value: string | number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : parseInt(`${value}`, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const asBoolean = (value: unknown): boolean => value === true || value === 'true' || value === '1';
