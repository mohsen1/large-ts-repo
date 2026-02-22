import { Topology } from './topology';
import { Throughput, StreamMetrics } from './types';

export interface CandidatePlan {
  name: string;
  score: number;
  throughput: Throughput;
}

export function propose(topology: Topology): CandidatePlan[] {
  const throughputBase = topology.nodes.length;
  const candidate1: CandidatePlan = {
    name: 'conservative',
    score: 0.6,
    throughput: { eventsPerSecond: throughputBase * 10, bytesPerSecond: throughputBase * 128 },
  };
  const candidate2: CandidatePlan = {
    name: 'aggressive',
    score: 0.4,
    throughput: { eventsPerSecond: throughputBase * 100, bytesPerSecond: throughputBase * 256 },
  };
  return [candidate1, candidate2];
}

export function select(metrics: StreamMetrics, candidates: CandidatePlan[]): CandidatePlan {
  if (metrics.lag > 1_000) {
    return candidates.sort((a, b) => b.score - a.score)[0] ?? candidates[0];
  }
  return candidates.sort((a, b) => b.throughput.eventsPerSecond - a.throughput.eventsPerSecond)[0] ?? candidates[0];
}

export function tune(plan: CandidatePlan, load: number): CandidatePlan {
  return {
    ...plan,
    throughput: {
      eventsPerSecond: plan.throughput.eventsPerSecond * load,
      bytesPerSecond: plan.throughput.bytesPerSecond * load,
    },
    score: plan.score * load,
  };
}
