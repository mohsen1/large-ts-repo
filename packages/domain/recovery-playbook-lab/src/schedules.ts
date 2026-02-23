import type { CampaignLane, PlaybookLabCampaignId, PlaybookLabRunId, PlaybookLabSchedule, ForecastTier } from './types';
import { withBrand } from '@shared/core';

const roundToMinute = (iso: string): number => {
  const now = new Date(iso);
  now.setSeconds(0, 0);
  return now.getTime();
}

const addMinutes = (base: number, minutes: number): number => base + minutes * 60 * 1000;

const buildRunId = (campaignId: PlaybookLabCampaignId, index: number): PlaybookLabRunId =>
  withBrand(`${campaignId}:run:${index}`, 'PlaybookLabRunId');

const buildForecastTier = (offsetMinutes: number): ForecastTier => {
  if (offsetMinutes <= 30) return 'near';
  if (offsetMinutes <= 240) return 'mid';
  return 'far';
};

export const buildLaneSchedule = (
  campaignId: PlaybookLabCampaignId,
  lane: CampaignLane,
  anchor: string,
  horizonMinutes: number,
  cadenceMinutes: number,
): readonly PlaybookLabSchedule[] => {
  const aligned = roundToMinute(anchor);
  const baseLaneShift = lane === 'recovery'
    ? 0
    : lane === 'performance'
      ? 8
      : lane === 'stability'
        ? 16
        : 24;
  const planned = Math.max(1, Math.floor(horizonMinutes / cadenceMinutes));
  return Array.from({ length: planned }).map((_, index) => {
    const offset = index * cadenceMinutes + baseLaneShift;
    const scheduledAt = addMinutes(aligned, offset);
    return {
      date: new Date(scheduledAt).toISOString().slice(0, 10),
      runAt: new Date(scheduledAt).toISOString(),
      lane,
      runId: buildRunId(campaignId, index),
      campaignId,
      forecastTier: buildForecastTier(offset),
      expectedDurationMinutes: Math.max(5, cadenceMinutes - (index % 3) * 2),
    };
  });
};

export const mergeSchedules = (
  left: readonly PlaybookLabSchedule[],
  right: readonly PlaybookLabSchedule[],
): readonly PlaybookLabSchedule[] => {
  const map = new Map<string, PlaybookLabSchedule>();
  for (const item of [...left, ...right]) {
    const key = `${item.runAt}:${item.lane}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    if (existing.expectedDurationMinutes >= item.expectedDurationMinutes) {
      continue;
    }
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => a.runAt.localeCompare(b.runAt));
};
