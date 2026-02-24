import { useMemo } from 'react';
import { DemandSignal } from '@domain/fulfillment-orchestration-analytics';

export interface DemandBucket {
  label: string;
  base: number;
  observed: number;
  confidence: number;
}

export interface DemandForecast {
  tenantId: string;
  bucketCount: number;
  averageBase: number;
  averageObserved: number;
  totalConfidence: number;
  buckets: readonly DemandBucket[];
}

const sortSignals = (signals: readonly DemandSignal[]) =>
  [...signals].sort((left, right) => left.sampleWindowStart.localeCompare(right.sampleWindowStart));

export const useDemandForecast = (signals: readonly DemandSignal[]): DemandForecast => {
  const sorted = sortSignals(signals);
  const bucketCount = sorted.length;
  const baseTotal = sorted.reduce((acc, signal) => acc + signal.baseDemand, 0);
  const observedTotal = sorted.reduce((acc, signal) => acc + signal.observedDemand, 0);
  const avgConfidence = sorted.reduce((acc, signal) => acc + signal.confidence, 0);
  const buckets = sorted.map((signal) => ({
    label: signal.sku,
    base: Number(signal.baseDemand.toFixed(2)),
    observed: Number(signal.observedDemand.toFixed(2)),
    confidence: Number(signal.confidence.toFixed(3)),
  }));

  return useMemo(
    () => ({
      tenantId: sorted[0]?.tenantId ?? 'unknown',
      bucketCount,
      averageBase: bucketCount ? Number((baseTotal / bucketCount).toFixed(2)) : 0,
      averageObserved: bucketCount ? Number((observedTotal / bucketCount).toFixed(2)) : 0,
      totalConfidence: sorted.length ? Number((avgConfidence / sorted.length).toFixed(3)) : 0,
      buckets,
    }),
    [avgConfidence, baseTotal, bucketCount, observedTotal, sorted],
  );
};
