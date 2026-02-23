import type { CampaignRecord } from './records';
import { buildTopology } from '@domain/recovery-signal-orchestration-models';

export interface CampaignStoreMetrics {
  readonly total: number;
  readonly avgSignals: number;
  readonly topDimension: string;
  readonly crossLinks: number;
  readonly activeRuns: number;
}

export const computeCampaignMetrics = (records: readonly CampaignRecord[]): CampaignStoreMetrics => {
  if (records.length === 0) {
    return {
      total: 0,
      avgSignals: 0,
      topDimension: 'capacity',
      crossLinks: 0,
      activeRuns: 0,
    };
  }

  const topologies = records.map((record) => buildTopology(record.plan.signals.map((signal) => ({
    id: signal.signalId,
    category: 'incident',
    tenantId: record.envelope.tenantId,
    facilityId: signal.facilityId,
    dimension: signal.dimension,
    value: signal.burst,
      baseline: 100 + signal.burst - 1,
    weight: signal.facilityWeight,
    timestamp: record.envelope.createdAt,
    observedAt: record.envelope.createdAt,
    source: 'agent',
    unit: 'rps',
    tags: ['signal'],
  }))));

  const totalSignals = records.reduce((acc, record) => acc + record.plan.signals.length, 0);
  const dimensionByTop = new Map<string, number>();
  const crossLinks = topologies.reduce((acc, topology) => acc + topology.crossLinks, 0);

  for (const topology of topologies) {
    const current = dimensionByTop.get(topology.topDimension) ?? 0;
    dimensionByTop.set(topology.topDimension, current + 1);
  }

  const sorted = [...dimensionByTop.entries()].sort((left, right) => right[1] - left[1]);

  return {
    total: records.length,
    avgSignals: Number((totalSignals / records.length).toFixed(2)),
    topDimension: sorted[0]?.[0] ?? 'capacity',
    crossLinks,
    activeRuns: records.filter((record) => record.run.state === 'active').length,
  };
};
