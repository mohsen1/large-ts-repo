import type { StudioRuntimeState } from './types';

const expectBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const expectNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const expectString = (value: unknown): value is string => typeof value === 'string';
const expectArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

export const parseRuntimeState = (payload: unknown): StudioRuntimeState => {
  const cast = payload as StudioRuntimeState;

  if (!cast || typeof cast !== 'object') {
    throw new Error('Expected object runtime payload');
  }

  if (!expectArray((cast as { sequences?: unknown }).sequences)) {
    throw new Error('Missing sequences payload');
  }

  if (!expectArray((cast as { runs?: unknown }).runs)) {
    throw new Error('Missing runs payload');
  }

  if (!expectArray((cast as { simulations?: unknown }).simulations)) {
    throw new Error('Missing simulations payload');
  }

  if (!expectArray((cast as { metrics?: unknown }).metrics)) {
    throw new Error('Missing metrics payload');
  }

  return cast;
};

export const guardCommandWindowState = (value: unknown): boolean =>
  value === 'draft' || value === 'queued' || value === 'active' || value === 'suspended' || value === 'complete' || value === 'failed';

export const guardCommandMetric = (metric: unknown): boolean => {
  if (!metric || typeof metric !== 'object') return false;
  const candidate = metric as {
    metricId?: unknown;
    commandId?: unknown;
    label?: unknown;
    value?: unknown;
    unit?: unknown;
  };

  return (
    expectString(candidate.metricId) &&
    expectString(candidate.commandId) &&
    expectString(candidate.label) &&
    expectNumber(candidate.value) &&
    (candidate.unit === 'ms' || candidate.unit === 'percent' || candidate.unit === 'count')
  );
};

export const hasActiveRun = (state: StudioRuntimeState): boolean => {
  if (!state.activeRun) return false;
  return state.activeRun.state === 'active';
};

export const parseMetricList = (value: unknown): StudioRuntimeState['metrics'] => {
  if (!expectArray(value) || !value.every(guardCommandMetric)) {
    throw new Error('Invalid metric list');
  }

  return value as StudioRuntimeState['metrics'];
};
