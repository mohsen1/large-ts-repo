import { useMemo } from 'react';
import { usePolicyStudioOrchestration } from './usePolicyStudioOrchestration';
import { StudioTopology } from '../models/policy-studio-types';

export interface UsePolicyTopologyOptions {
  readonly compact?: boolean;
  readonly maxNodes?: number;
  readonly maxEdges?: number;
}

export interface UsePolicyTopologyResult {
  readonly topology: StudioTopology;
  readonly counts: {
    readonly nodes: number;
    readonly edges: number;
    readonly groups: number;
  };
}

export function usePolicyTopology(options: UsePolicyTopologyOptions = {}): UsePolicyTopologyResult {
  const { state } = usePolicyStudioOrchestration();
  const compact = options.compact ?? false;
  const maxNodes = options.maxNodes ?? 120;
  const maxEdges = options.maxEdges ?? 240;

  const topology = useMemo<StudioTopology>(() => {
    const limitedNodes = compact ? state.topology.nodes.slice(0, maxNodes) : state.topology.nodes;
    const limitedEdges = compact ? state.topology.edges.slice(0, maxEdges) : state.topology.edges;
    return {
      ...state.topology,
      nodes: limitedNodes,
      edges: limitedEdges,
    };
  }, [compact, maxEdges, maxNodes, state.topology]);

  return useMemo(
    () => ({
      topology,
      counts: {
        nodes: topology.nodes.length,
        edges: topology.edges.length,
        groups: topology.groups.length,
      },
    }),
    [topology],
  );
}

