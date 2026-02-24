import { useMemo } from 'react';
import type { ChaosScenarioDefinition, StageBoundary } from '@domain/recovery-chaos-lab';
import { createTopology } from '@domain/recovery-chaos-lab';

export interface TopologyMetrics {
  readonly nodes: number;
  readonly edges: number;
  readonly score: number;
}

export interface TopologyState<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly blueprint: ChaosScenarioDefinition & { stages: T };
  readonly metrics: TopologyMetrics;
  readonly edges: readonly { from: string; to: string; weight: number }[];
}

export function useChaosTopology<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  blueprint: ChaosScenarioDefinition & { stages: T }
): TopologyState<T> {
  const metrics = useMemo(() => {
    const topology = createTopology(blueprint.stages);
    const nodes = blueprint.stages.length;
    const edges = topology.length;
    const score = edges === 0 ? 0 : Math.round((nodes / Math.max(edges, 1)) * 100);
    return { nodes, edges, score, topology };
  }, [blueprint.stages]);

  return {
    blueprint,
    metrics: {
      nodes: metrics.nodes,
      edges: metrics.edges,
      score: metrics.score
    },
    edges: metrics.topology.map((edge) => ({
      from: edge.from,
      to: edge.to,
      weight: edge.weight ?? 0
    }))
  };
}
