import { makeSimulationRunId, simulationWaveIdFromRunId, type SimulationConstraint, type SimulationGraph, type SimulationWindow, type SimulationWave, type SimulationRunId } from './types';
import { resolveWindowCoverage } from './scheduler';
import { normalizeGraph, partitionByOwner } from './graph';

export interface PlannedWave {
  readonly wave: SimulationWave;
  readonly ownerMix: Readonly<Record<'sre' | 'platform' | 'core' | 'security', number>>;
}

const severityWeight = (severity: 'critical' | 'high' | 'medium' | 'low'): number => {
  switch (severity) {
    case 'critical':
      return 6;
    case 'high':
      return 4;
    case 'medium':
      return 2;
    default:
      return 1;
  }
};

import { type ReadinessSignal } from '@domain/recovery-readiness';

export const buildSignalBuckets = (signals: readonly ReadinessSignal[]) => {
  const buckets = new Map<number, ReadinessSignal[]>();
  for (const signal of signals) {
    const minute = new Date(signal.capturedAt).getUTCMinutes();
    const bucket = buckets.get(minute) ?? [];
    bucket.push(signal);
    buckets.set(minute, bucket);
  }
  return buckets;
};

export const estimateSignalMix = (signals: readonly ReadinessSignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }
  const severityTotal = signals.reduce((sum, signal) => sum + severityWeight(signal.severity), 0);
  return Number((severityTotal / signals.length).toFixed(3));
};

export const buildAllocations = (
  graph: SimulationGraph,
  constraints: SimulationConstraint,
  runId: SimulationRunId,
): readonly PlannedWave[] => {
  const normalized = normalizeGraph(graph, constraints);
  const sortedNodes = [...normalized.nodes].sort((a, b) => b.criticality - a.criticality);
  const windows = Array.from({ length: Math.max(1, Math.min(6, sortedNodes.length || 1)) }, (_, index) => ({
    waveId: simulationWaveIdFromRunId(runId, index),
    startUtc: new Date(Date.now() + index * 60_000).toISOString(),
    endUtc: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
    expectedSignals: constraints.maxSignalsPerWave,
    targetCount: sortedNodes.length,
    windowIndex: index,
  }) as SimulationWindow);

  const ownerBuckets = partitionByOwner(sortedNodes);
  const coverage = resolveWindowCoverage(constraints, windows.length);

  return windows.map((window, index) => {
    const waveNodes = sortedNodes.filter((_, nodeIndex) => nodeIndex % windows.length === index);
    const expectedSignalShare = waveNodes.reduce((sum, node) => sum + node.expectedSignalsPerMinute, 0);
    const wave: SimulationWave = {
      id: window.waveId,
      sequence: waveNodes.map((node) => makeSimulationRunId(node.id)),
      readyAt: new Date(coverage * index).toISOString(),
      parallelism: Math.min(constraints.maxParallelNodes, Math.max(1, waveNodes.length)),
      signalCount: expectedSignalShare,
      window,
    };

    return {
      wave,
      ownerMix: {
        sre: ownerBuckets.sre.length,
        platform: ownerBuckets.platform.length,
        core: ownerBuckets.core.length,
        security: ownerBuckets.security.length,
      },
    };
  });
};

export const scorePlanFromAllocations = (allocations: readonly PlannedWave[]): number => {
  const coverage = allocations.reduce((sum, item) => sum + item.wave.signalCount, 0);
  return allocations.length === 0 ? 0 : coverage / allocations.length;
};
