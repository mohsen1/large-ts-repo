import { useMemo } from 'react';
import type { LaneHealth } from '../types';

export interface LaneStat {
  readonly label: string;
  readonly score: number;
  readonly healthy: boolean;
}

export const useLaneDashboard = (lanes: readonly LaneHealth[]): LaneStat[] => {
  return useMemo(
    () =>
      lanes
        .map((lane) => ({
          label: lane.lane,
          score: lane.score,
          healthy: lane.score >= 75 && lane.state !== 'degraded',
        }))
        .sort((left, right) => right.score - left.score),
    [lanes],
  );
};

export const laneTrend = (stats: readonly LaneStat[]): 'up' | 'down' | 'flat' => {
  const top = [...stats].map((item) => item.score);
  if (top.length < 2) {
    return 'flat';
  }
  const diff = top[0] - top[top.length - 1];
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
};
