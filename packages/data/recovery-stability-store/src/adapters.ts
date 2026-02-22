import type { StabilityRunId, StabilityWindow } from '@domain/recovery-stability-models';
import type { StoreFilter } from './query';

export interface StabilityPager {
  readonly runId: StabilityRunId;
  readonly cursor?: StabilityWindow;
  readonly limit: number;
}

export const buildPager = (runId: StabilityRunId, limit: number): StabilityPager => ({
  runId,
  limit: Math.min(100, Math.max(1, limit)),
});

export const buildSignalFilter = (input: Partial<StoreFilter>): StoreFilter => ({
  runId: input.runId,
  serviceIds: input.serviceIds,
  alertClass: input.alertClass,
  minValue: input.minValue,
  window: input.window,
  ids: input.ids,
});
