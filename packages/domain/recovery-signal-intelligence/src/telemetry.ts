import type { SignalFeedSnapshot } from './models';
import { aggregateByDimension } from './insights';

export interface SignalSnapshotMetrics {
  topDimension: string;
  avgDrift: number;
  criticalCount: number;
  facilityCount: number;
}

export const snapshotMetrics = (snapshot: SignalFeedSnapshot): SignalSnapshotMetrics => {
  const grouped = aggregateByDimension(snapshot.pulses);
  const sorted = Object.entries(grouped).sort((left, right) => right[1].intensity - left[1].intensity);
  const criticalCount = snapshot.priorities.filter((priority) => priority.urgency === 'critical').length;
  const facilityCount = new Set(snapshot.pulses.map((pulse) => pulse.facilityId)).size;
  const avgDrift = snapshot.pulses.length
    ? Number((snapshot.pulses.reduce((acc, pulse) => acc + (pulse.value - pulse.baseline), 0) / snapshot.pulses.length).toFixed(4))
    : 0;

  return {
    topDimension: sorted[0]?.[0] ?? 'capacity',
    avgDrift,
    criticalCount,
    facilityCount,
  };
};

export const topFacilitiesByRisk = (snapshot: SignalFeedSnapshot): string[] => {
  const byFacility = snapshot.pulses.reduce<Record<string, number>>((acc, pulse) => {
    acc[pulse.facilityId] = (acc[pulse.facilityId] ?? 0) + Math.abs((pulse.value - pulse.baseline) / Math.max(1, Math.abs(pulse.baseline)));
    return acc;
  }, {});

  return Object.entries(byFacility)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([facility]) => facility);
};
