import { Throughput } from './types';
import { Topology } from './topology';

export interface PlanStep {
  nodeId: string;
  task: string;
  parallelism: number;
}

export interface StreamPlan {
  steps: PlanStep[];
  throughputEstimate: Throughput;
}

export function plan(topology: Topology, target: Throughput): StreamPlan {
  const steps = topology.nodes.map((node) => ({
    nodeId: node.id,
    task: node.kind,
    parallelism: Math.max(1, Math.floor(target.eventsPerSecond / Math.max(topology.nodes.length, 1))),
  }));

  return {
    steps,
    throughputEstimate: target,
  };
}

export function scale(plan: StreamPlan, factor: number): StreamPlan {
  return {
    steps: plan.steps.map((step) => ({
      ...step,
      parallelism: Math.max(1, Math.round(step.parallelism * factor)),
    })),
    throughputEstimate: {
      eventsPerSecond: plan.throughputEstimate.eventsPerSecond * factor,
      bytesPerSecond: plan.throughputEstimate.bytesPerSecond * factor,
    },
  };
}
