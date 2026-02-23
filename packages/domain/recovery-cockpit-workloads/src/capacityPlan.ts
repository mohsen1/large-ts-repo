import { RecoveryAction, RecoveryPlan, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import { toTimestamp } from '@domain/recovery-cockpit-models';
import { WorkloadTopology, ServiceTopologyNode } from './topology';
import { buildTopologySnapshot } from './topology';

export type CapacityZone = 'sparse' | 'balanced' | 'saturated';

export type CapacityBucket = {
  readonly zone: CapacityZone;
  readonly actionId: string;
  readonly serviceCode: string;
  readonly actionCount: number;
  readonly averageDuration: number;
  readonly concurrencyRisk: number;
  readonly recommendations: readonly string[];
};

export type CapacityPlan = {
  readonly planId: string;
  readonly generatedAt: UtcIsoTimestamp;
  readonly buckets: readonly CapacityBucket[];
  readonly zone: CapacityZone;
  readonly score: number;
  readonly topology: WorkloadTopology;
};

export type CapacityDelta = {
  readonly planId: string;
  readonly zone: CapacityZone;
  readonly moved: number;
  readonly suggestions: readonly string[];
};

const zoneFor = (ratio: number): CapacityZone => {
  if (ratio >= 0.75) return 'saturated';
  if (ratio >= 0.45) return 'balanced';
  return 'sparse';
};

const bucketForNode = (node: ServiceTopologyNode): CapacityBucket => {
  const actionCount = node.actionCount;
  const averageDuration = node.averageDurationMinutes;
  const concurrencyRisk = Math.min(100, node.actionCount * 15 + node.topologies.length * 2 + averageDuration);
  const recommendations = node.tags.includes('control-plane')
    ? ['scale control path', 'audit dependencies']
    : node.tags.includes('database')
      ? ['stagger database actions', 'review lock windows']
      : node.topologies.length > 1
        ? ['collapse duplicate topology labels', 'run canary first']
        : ['keep linear ordering'];

  return {
    zone: zoneFor(concurrencyRisk / 100),
    actionId: node.nodeId,
    serviceCode: node.serviceCode,
    actionCount,
    averageDuration,
    concurrencyRisk: Number(concurrencyRisk.toFixed(2)),
    recommendations,
  };
};

const ratio = (values: readonly CapacityBucket[]): number => {
  if (values.length === 0) return 0;
  const saturated = values.filter((entry) => entry.zone === 'saturated').length;
  const balanced = values.filter((entry) => entry.zone === 'balanced').length;
  return (saturated * 2 + balanced) / (values.length * 3);
};

export const buildCapacityPlan = (plan: RecoveryPlan): CapacityPlan => {
  const topology = buildTopologySnapshot(plan);
  const buckets = [...topology.nodesById.values()].map(bucketForNode);
  const zone = zoneFor(ratio(buckets));
  const score = Number((100 - ratio(buckets) * 100).toFixed(2));

  return {
    planId: plan.planId,
    generatedAt: toTimestamp(new Date()),
    buckets,
    zone,
    score,
    topology: {
      namespace: plan.labels.short,
      region: plan.actions[0]?.region ?? 'global',
      nodes: [...topology.nodesById.values()],
      generatedAt: toTimestamp(new Date()),
    },
  };
};

export const compareCapacityPlans = (left: CapacityPlan, right: CapacityPlan): number => right.score - left.score;

export const summarizeCapacity = (plan: CapacityPlan): string =>
  `${plan.planId} zone=${plan.zone} score=${plan.score} nodes=${plan.topology.nodes.length}`;

export const proposeCapacityDeltas = (plan: CapacityPlan, targetZone: CapacityZone): CapacityDelta => {
  if (plan.zone === targetZone) {
    return {
      planId: plan.planId,
      zone: plan.zone,
      moved: 0,
      suggestions: ['already in target zone'],
    };
  }

  const saturated = plan.buckets.filter((entry) => entry.zone === 'saturated');
  const balanced = plan.buckets.filter((entry) => entry.zone === 'balanced');
  const suggestions = targetZone === 'sparse'
    ? ['reduce concurrency', 'increase queue depth', 'prioritize critical path']
    : targetZone === 'saturated'
      ? ['add capacity headroom', 'split high duration actions', 'enable pre-run simulation']
      : ['balance by service', 'distribute tags', 'normalize dependencies'];

  const moved = Math.max(0, targetZone === 'sparse' ? saturated.length + balanced.length : saturated.length);
  return {
    planId: plan.planId,
    zone: targetZone,
    moved,
    suggestions,
  };
};

export const capacityForActions = (plan: RecoveryPlan): readonly number[] =>
  plan.actions
    .map((action: RecoveryAction) => action.expectedDurationMinutes + action.dependencies.length * 5)
    .sort((left, right) => right - left);

export const capacityBuckets = (plan: RecoveryPlan): ReadonlyMap<string, readonly CapacityBucket[]> => {
  const grouped = new Map<string, CapacityBucket[]>();
  const built = buildCapacityPlan(plan);
  for (const bucket of built.buckets) {
    const existing = grouped.get(bucket.zone) ?? [];
    grouped.set(bucket.zone, [...existing, bucket]);
  }
  return grouped;
};

export const capacityUtilization = (plan: CapacityPlan): number => {
  if (plan.topology.nodes.length === 0) return 0;
  const total = plan.buckets.reduce((acc, bucket) => acc + bucket.concurrencyRisk, 0);
  return Number((total / plan.buckets.length).toFixed(2));
};
