import { Brand, ResultState } from '@shared/core';

export type Ok<T> = {
  ok: true;
  value: T;
  code?: Brand<string, "ResultCode">;
};

export type Fail<E> = {
  ok: false;
  error: E;
  code?: Brand<string, "ResultCode">;
};

export type Result<T, E = Error> = Ok<T> | Fail<E>;

export const ok = <T>(value: T, code?: string): Ok<T> => ({
  ok: true,
  value,
  code: code ? (code as Brand<string, "ResultCode">) : undefined,
});

export const fail = <E>(error: E, code?: string): Fail<E> => ({
  ok: false,
  error,
  code: code ? (code as Brand<string, "ResultCode">) : undefined,
});

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;

export const mapResult = <A, B, E>(result: Result<A, E>, mapper: (value: A) => B): Result<B, E> =>
  result.ok ? ok(mapper(result.value), result.code) : fail(result.error, result.code);

export const flatMapResult = <A, B, E>(result: Result<A, E>, mapper: (value: A) => Result<B, E>): Result<B, E> =>
  result.ok ? mapper(result.value) : fail(result.error, result.code);

export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error('Unwrap failed');
  }
  return result.value;
};

export const all = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const item of results) {
    if (!item.ok) return fail(item.error, item.code);
    values.push(item.value);
  }
  return ok(values);
};

export const fromPromise = async <T, E = Error>(promise: Promise<T>): Promise<Result<T, E>> => {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return fail((error as E) ?? (new Error('promise-failed') as E));
  }
};

export const combine = <A extends readonly Result<any, any>[]>(
  ...results: A
): Result<{ [K in keyof A]: A[K] extends Result<infer V, any> ? V : never }, A[number] extends Result<any, infer E> ? E : never> => {
  const output: unknown[] = [];
  for (const result of results) {
    if (!result.ok) return fail(result.error, result.code);
    output.push(result.value);
  }
  return ok(output as any);
};

export const toStandard = <T, E>(result: Result<T, E>): ResultState<T, E> =>
  result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
