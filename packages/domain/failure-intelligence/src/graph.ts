import { Brand } from '@shared/core';
import { type FailureSignalId, type GraphSignalLink } from './models';

export type SignalNodeId = Brand<string, 'SignalNodeId'>;

export interface SignalGraph {
  nodes: SignalNodeId[];
  edges: GraphSignalLink[];
}

export interface RouteScore {
  source: FailureSignalId;
  target: FailureSignalId;
  confidence: number;
}

const normalize = (value: string): SignalNodeId => value as SignalNodeId;

export const buildDependencyGraph = (signals: readonly string[]): SignalGraph => {
  const nodes = signals.map((id) => normalize(id));
  const edges: GraphSignalLink[] = [];

  for (let left = 0; left < nodes.length - 1; left += 1) {
    const from = signals[left] as FailureSignalId;
    for (let right = left + 1; right < nodes.length; right += 1) {
      const to = signals[right] as FailureSignalId;
      const weight = Number(((right + left + 1) % 10) / 10);
      if (weight > 0.1) {
        edges.push({ from, to, weight });
      }
    }
  }

  return { nodes, edges };
};

export const buildRoutes = (graph: SignalGraph): RouteScore[] => {
  return graph.edges.map((edge) => ({
    source: edge.from,
    target: edge.to,
    confidence: edge.weight,
  }));
};

export const summarizeGraph = (graph: SignalGraph): string => {
  return `${graph.nodes.length} nodes -> ${graph.edges.length} edges`;
};
