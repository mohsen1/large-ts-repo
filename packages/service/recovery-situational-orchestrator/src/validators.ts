import type { OrchestrateRequest } from './types';

const hasString = (value: unknown): value is string => typeof value === 'string';
const hasObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const hasStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

export const validateRequest = (value: unknown): OrchestrateRequest => {
  assert(hasObject(value), 'Invalid request payload');
  const context = (value as Record<string, unknown>).context;
  const node = (value as Record<string, unknown>).node;
  const snapshot = (value as Record<string, unknown>).snapshot;
  const signals = (value as Record<string, unknown>).signals;
  const mode = (value as Record<string, unknown>).mode;

  assert(hasObject(context), 'Missing context');
  assert(hasString((context as Record<string, unknown>).operator), 'Missing operator');
  assert(hasString((context as Record<string, unknown>).createdAt), 'Missing createdAt');
  assert(hasString((context as Record<string, unknown>).environment), 'Missing environment');
  assert(hasString((context as Record<string, unknown>).policyTag), 'Missing policyTag');
  assert(hasString((context as Record<string, unknown>).correlationToken), 'Missing correlation token');

  assert(hasObject(node), 'Missing node');
  assert(hasObject(snapshot), 'Missing snapshot');
  assert(hasStringArray((signals ?? [])), 'Missing signals');
  assert(mode === 'live' || mode === 'simulation', 'Invalid mode');

  return value as OrchestrateRequest;
};
