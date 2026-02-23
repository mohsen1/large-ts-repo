import {
  type CommandNetworkEdge,
  type CommandNetworkNodeId,
  type RuntimeIntent,
  type CommandWave,
  type PlanWindow,
} from './types';
import { isNodeReachable } from './topology';

const toDateMs = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const estimateWaveLoad = (wave: CommandWave, edges: readonly CommandNetworkEdge[]): number => {
  const baseLatency = edges.reduce((sum, edge) => sum + Math.max(0, edge.meta.latencyMsP95), 0);
  const errorFactor = edges.reduce((sum, edge) => sum + edge.meta.errorRatePercent, 0) / Math.max(1, edges.length);
  const risk = Math.max(0.01, 1 - errorFactor / 100);
  const weight = Math.max(1, wave.commandCount) * risk + baseLatency / 100;
  return Number(weight.toFixed(3));
};

export const scheduleWaveWindows = (windows: readonly PlanWindow[], intents: readonly RuntimeIntent[]): CommandWave[] => {
  const sortedWindows = [...windows].sort((left, right) => toDateMs(left.fromUtc) - toDateMs(right.fromUtc));
  const sortedIntents = [...intents].sort(
    (left, right) => toDateMs(left.targetWindow.fromUtc) - toDateMs(right.targetWindow.fromUtc),
  );

  const waves: CommandWave[] = [];
  let waveIndex = 1;

  for (let i = 0; i < sortedIntents.length; i += 1) {
    const intent = sortedIntents[i];
    const target = sortedWindows[i % sortedWindows.length] ?? sortedWindows[0];
    if (!target) {
      continue;
    }

    const baseCommandCount = intent.waves.length + (intent.priority === 'critical' ? 12 : 6);
    const commandCount = Math.min(64, Math.max(1, baseCommandCount));
    waves.push({
      waveIndex,
      nodeIds: [intent.waves[0]?.nodeIds?.[0] ?? (intent.commandNetworkId as unknown as CommandNetworkNodeId)],
      startAt: target.fromUtc,
      deadlineAt: target.toUtc,
      commandCount,
      readinessWindow: {
        windowId: `window-${waveIndex}` as any,
        label: `Wave ${waveIndex}`,
        fromUtc: target.fromUtc,
        toUtc: target.toUtc,
        timezone: 'UTC',
      },
    });
    waveIndex += 1;
  }

  return waves;
};

const computeNodeCoverage = (edges: readonly CommandNetworkEdge[], intentNodeIds: readonly CommandNetworkNodeId[]): number => {
  const coverableNodes = new Set<CommandNetworkNodeId>();
  for (const edge of edges) {
    if (intentNodeIds.includes(edge.from)) {
      coverableNodes.add(edge.to);
    }
  }

  return Number((coverableNodes.size / Math.max(1, intentNodeIds.length)).toFixed(3));
};

export const buildSchedulingHealth = (
  graph: ReadonlyMap<CommandNetworkNodeId, readonly CommandNetworkEdge[]>,
  graphNodeIds: readonly CommandNetworkNodeId[],
) => {
  const entries = [...graph.entries()];
  const reachability: Array<{ nodeId: CommandNetworkNodeId; reachableNodes: number; coverage: number }> = [];

  for (const [nodeId, edges] of entries) {
    let maxCoverage = 0;
    for (const destination of graphNodeIds) {
      const tempGraph = {
        networkId: 'temp' as any,
        nodesByRole: {
          ingest: graphNodeIds,
          plan: graphNodeIds,
          simulate: graphNodeIds,
          execute: graphNodeIds,
          audit: graphNodeIds,
        },
        adjacency: Object.fromEntries(entries) as Record<CommandNetworkNodeId, readonly CommandNetworkEdge[]>,
        activePolicyIds: [],
      };

      if (isNodeReachable(tempGraph, nodeId, destination)) {
        maxCoverage += 1;
      }
    }

    reachability.push({
      nodeId,
      reachableNodes: maxCoverage,
      coverage: computeNodeCoverage(edges, graphNodeIds),
    });
  }

  const totalCoverage = reachability.reduce((sum, entry) => sum + entry.reachableNodes, 0);
  const meanCoverage = totalCoverage / Math.max(1, graphNodeIds.length);

  return {
    reachability: reachability.sort((left, right) => right.reachableNodes - left.reachableNodes),
    coverageScore: Number(meanCoverage.toFixed(2)),
  };
};
