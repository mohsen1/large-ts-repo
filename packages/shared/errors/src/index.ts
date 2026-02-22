import { Brand } from '@shared/core';

export type ErrorCode = Brand<string, 'ErrorCode'>;

export interface ErrorContext {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  details?: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.cause = cause;
    this.name = 'AppError';
  }

  withContext(context: Record<string, unknown>): this {
    Object.assign(this.details ??= {}, context);
    return this;
  }
}

export class ValidationError extends AppError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(code, message, details, cause);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const details = id ? { resource, id } : { resource };
    super(`not_found` as ErrorCode, `${resource} was not found`, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(resource: string, message?: string) {
    super(`conflict` as ErrorCode, message ?? `Conflicting state for ${resource}`);
    this.name = 'ConflictError';
  }
}

export class DependencyCycleError extends AppError {
  constructor(graph: string) {
    super(`dependency_cycle` as ErrorCode, `Dependency cycle detected in ${graph}`);
    this.name = 'DependencyCycleError';
  }
}

export const isAppError = (error: unknown): error is AppError => {
  return error instanceof Error && (error as AppError).code !== undefined;
};

export const withCode = <T extends object>(error: T, code: ErrorCode): T & { code: ErrorCode } => ({
  ...(error as object),
  code,
} as T & { code: ErrorCode });

export const knownCodes = {
  validation: 'validation' as ErrorCode,
  timeout: 'timeout' as ErrorCode,
  notFound: 'not_found' as ErrorCode,
  conflict: 'conflict' as ErrorCode,
  unauthorized: 'unauthorized' as ErrorCode,
};
