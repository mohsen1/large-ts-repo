import { withBrand } from '@shared/core';

import type { ContinuityWindow, ContinuityWindowId, ContinuityTenantId, ContinuitySnapshot } from './types';

const MINUTE_MS = 60_000;

export interface BucketWindowInput {
  readonly tenantId: ContinuityTenantId;
  readonly from: string;
  readonly to: string;
  readonly horizonMinutes: number;
}

export interface ForecastWindowSummary {
  readonly window: ContinuityWindow;
  readonly buckets: readonly { readonly start: string; readonly end: string; readonly count: number }[];
}

const normalizeWindow = (value: string): string => new Date(Math.floor(Date.parse(value) / MINUTE_MS) * MINUTE_MS).toISOString();

const windowDurationMs = (minutes: number): number => Math.max(1, minutes) * MINUTE_MS;

export const buildWindow = (input: BucketWindowInput): ContinuityWindow => ({
  id: withBrand(`${input.tenantId}:${input.from}:${input.to}`, 'ContinuityWindowId'),
  tenantId: input.tenantId,
  from: normalizeWindow(input.from),
  to: normalizeWindow(input.to),
  horizonMinutes: Math.max(1, input.horizonMinutes),
  snapshotIds: [],
});

export const buildBuckets = (
  window: BucketWindowInput,
  snapshots: readonly ContinuitySnapshot[],
): ForecastWindowSummary => {
  const span = Math.max(1, Number(window.horizonMinutes));
  const totalWindow = windowDurationMs(span);
  const bucketMs = Math.max(MINUTE_MS, Math.floor(totalWindow / 6));
  const fromTs = Date.parse(window.from);
  const toTs = fromTs + totalWindow;

  const buckets: { start: string; end: string; count: number }[] = [];
  for (let cursor = fromTs; cursor < toTs; cursor += bucketMs) {
    buckets.push({
      start: new Date(cursor).toISOString(),
      end: new Date(Math.min(cursor + bucketMs, toTs)).toISOString(),
      count: 0,
    });
  }

  for (const snapshot of snapshots) {
    const startTs = Date.parse(snapshot.windowStart);
    if (Number.isNaN(startTs)) continue;
    const offset = Math.max(0, startTs - fromTs);
    const index = Math.min(buckets.length - 1, Math.floor(offset / bucketMs));
    if (index >= 0 && index < buckets.length) {
      buckets[index].count += 1;
    }
  }

  return {
    window: buildWindow(window),
    buckets,
  };
};
