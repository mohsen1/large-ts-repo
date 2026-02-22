import { Brand } from '@shared/core';
import { ok, fail } from '@shared/result';
import { z, ZodTypeAny, infer as zInfer } from 'zod';

export type ValidatorResult<T> = ReturnType<typeof ok<T>> | ReturnType<typeof fail<unknown>>;

export type Validator<T> = {
  schema: ZodTypeAny;
  parse: (value: unknown) => ReturnType<typeof ok<T>> | ReturnType<typeof fail<Error>>;
};

export type SchemaOf<T> = z.ZodType<T> | ZodTypeAny;

export const createValidator = <T extends ZodTypeAny>(schema: T): Validator<zInfer<T>> => ({
  schema,
  parse: (value: unknown) => {
    const result = schema.safeParse(value);
    if (result.success) return ok(result.data as zInfer<T>);
    return fail(new Error(result.error.message));
  },
});

export type BrandedValidator<T, B extends string> = Validator<Brand<T, B>> & { brand: B };

export const brandFrom = <T, B extends string>(schema: SchemaOf<T>, brand: B): BrandedValidator<T, B> => ({
  schema,
  brand,
  parse: (value: unknown) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return fail(new Error(parsed.error.message));
    return ok((parsed.data as T) as Brand<T, B>);
  },
});

export const normalizePhone = (input: string): string => input.replace(/\D/g, '');

export const isEmail = (input: string): boolean => /^(\S+)@(\S+)\.(\S+)$/.test(input);

export const isUUID = (input: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);

export const ensure = <T>(value: T | undefined | null, fallback: T): T => value == null ? fallback : value;

export const trim = (value: string): string => value.trim();

export const slug = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
};

export const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export const coerceToInt = (value: string | number, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const validators = {
  createValidator,
  brandFrom,
};
