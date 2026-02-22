import { useMemo } from 'react';

import type { FabricNodeId, FabricScenario } from '@domain/recovery-fabric-models';
import {
  summarizeTopology,
  traceDependencyPath,
  selectRouteNodes,
} from '@domain/recovery-fabric-models';

interface RecoveryFabricRiskRadarProps {
  readonly scenario: FabricScenario;
  readonly candidateNodeIds: readonly FabricNodeId[];
}

interface NodeScore {
  readonly nodeId: FabricNodeId;
  readonly resilienceScore: number;
  readonly readiness: number;
  readonly risk: number;
}

const riskBadgeColor = (risk: number) => {
  if (risk > 0.6) return '#ff4d4f';
  if (risk > 0.3) return '#faad14';
  return '#52c41a';
};

export const RecoveryFabricRiskRadar = ({ scenario, candidateNodeIds }: RecoveryFabricRiskRadarProps) => {
  const nodeScores = useMemo<NodeScore[]>(() => {
    const routeNodes = selectRouteNodes(candidateNodeIds, 6);
    return routeNodes
      .map((nodeId) => {
        const node = scenario.nodes.find((entry) => entry.id === nodeId);
        if (!node) return undefined;
        const risk = Number((1 - node.readiness).toFixed(3));
        return {
          nodeId: node.id,
          resilienceScore: node.resilienceScore,
          readiness: node.readiness,
          risk,
        };
      })
      .filter((entry): entry is NodeScore => Boolean(entry));
  }, [candidateNodeIds, scenario]);

  const topologyPath = useMemo(() => {
    if (scenario.nodes.length === 0) return [];
    const links = scenario.links;
    const start = scenario.nodes[0]?.id;
    if (!start) return [];
    return traceDependencyPath(start, links);
  }, [scenario]);

  const averageRisk = useMemo(() => {
    if (nodeScores.length === 0) return 0;
    return Number((nodeScores.reduce((sum, entry) => sum + entry.risk, 0) / nodeScores.length).toFixed(3));
  }, [nodeScores]);

  const topology = summarizeTopology(scenario.nodes, scenario.links);

  return (
    <section>
      <h3>Risk radar</h3>
      <p>{`topology size: ${scenario.nodes.length}-${scenario.links.length}`}</p>
      <p>{`criticality: ${topology.criticality}`}</p>
      <p>{`average risk: ${averageRisk}`}</p>
      <ul>
        {nodeScores.map((entry) => (
          <li key={entry.nodeId} style={{ color: riskBadgeColor(entry.risk), marginBottom: '0.25rem' }}>
            <strong>{entry.nodeId}</strong>
            {' · '}
            {`resilience ${entry.resilienceScore}`}
            {' · '}
            {`ready ${entry.readiness}`}
            {' · '}
            {`risk ${entry.risk}`}
          </li>
        ))}
      </ul>
      <div>
        <strong>Dependency path</strong>
        <p>{topologyPath.join(' → ') || 'empty'}</p>
      </div>
      <div>
        <strong>Isolated nodes</strong>
        <p>{topology.isolatedNodeCount === 0 ? 'none' : topology.isolatedNodeCount}</p>
      </div>
    </section>
  );
};
