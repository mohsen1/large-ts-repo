import { withBrand } from '@shared/core';
import type { CommandLane, CommandMetric, CommandNode, CommandSequence, CommandStudioCommandId } from './types';
import { average } from './utils';

export interface LaneDemand {
  readonly commandId: CommandStudioCommandId;
  readonly demand: number;
}

export interface AllocationPlan {
  readonly lanes: readonly CommandLane[];
  readonly unallocated: readonly CommandStudioCommandId[];
  readonly utilization: number;
}

const stableNodeScore = (node: CommandNode, history: readonly CommandMetric[]): number => {
  const nodeMetrics = history.filter((metric) => metric.commandId === node.id);
  if (!nodeMetrics.length) return 1;
  const latency = nodeMetrics.filter((metric) => metric.unit === 'ms').map((metric) => metric.value);
  const approvalPenalty = node.commands.includes('approve') ? 1.2 : 1;
  return Math.max(0.1, 1 - average(latency) / 120_000) * approvalPenalty;
};

const buildDemands = (sequence: CommandSequence, metrics: readonly CommandMetric[]): readonly LaneDemand[] =>
  sequence.nodes.map((node) => ({
    commandId: node.id,
    demand: stableNodeScore(node, metrics) * (node.commands.length + 1),
  }));

const sortDemands = (demands: readonly LaneDemand[]) =>
  [...demands].sort((a, b) => b.demand - a.demand);

export const buildAllocation = (sequence: CommandSequence, metrics: readonly CommandMetric[]): AllocationPlan => {
  const lanes: Array<{ laneId: CommandLane['laneId']; name: string; nodeIds: CommandStudioCommandId[]; capacity: number }> = [];
  const capacityPerLane = Math.max(1, Math.floor(sequence.nodes.length / 3) + 1);
  const demands = sortDemands(buildDemands(sequence, metrics));

  const unallocated: CommandStudioCommandId[] = [];

  for (const demand of demands) {
    const lane = lanes.find((item) => item.nodeIds.length < item.capacity);
    if (!lane) {
      const laneId = withBrand(`${sequence.sequenceId}-lane-${lanes.length}`, 'LaneId');
      const created = {
        laneId,
        name: `Lane ${lanes.length + 1}`,
        nodeIds: [demand.commandId],
        capacity: capacityPerLane,
      } as { laneId: CommandLane['laneId']; name: string; nodeIds: CommandStudioCommandId[]; capacity: number };
      lanes.push(created);
      continue;
    }

    lane.nodeIds.push(demand.commandId);
  }

  const usedCapacity = lanes.reduce((acc, item) => acc + item.nodeIds.length, 0);
  const totalCapacity = lanes.reduce((acc, item) => acc + item.capacity, 0);
  const utilization = totalCapacity > 0 ? usedCapacity / totalCapacity : 0;

  return {
    lanes: lanes as readonly CommandLane[],
    unallocated,
    utilization: Math.min(1, utilization),
  };
};

export const rebalanceLanes = (plan: AllocationPlan): AllocationPlan => {
  if (plan.unallocated.length === 0) return plan;

  const nextLanes = plan.lanes.map((lane) => ({
    ...lane,
    nodeIds: [...lane.nodeIds],
  }));
  const freeNodes = [...plan.unallocated];

  for (const lane of nextLanes) {
    while (lane.nodeIds.length < lane.capacity && freeNodes.length > 0) {
      const candidate = freeNodes.shift();
      if (candidate) {
        lane.nodeIds.push(candidate);
      }
    }
  }

  return {
    lanes: nextLanes,
    unallocated: freeNodes,
    utilization: 1,
  };
};
