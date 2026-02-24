import { FC, useMemo } from 'react';
import type { ConstellationRunSnapshot } from '@data/recovery-cockpit-constellation-store';
import type { ConstellationNode } from '@domain/recovery-cockpit-constellation-core';
import { planToTopology } from '@data/recovery-cockpit-constellation-store';

type TopologyRow = {
  readonly node: ConstellationNode;
  readonly inbound: number;
  readonly outbound: number;
};

export const ConstellationTopologyPanel: FC<{ snapshot?: ConstellationRunSnapshot | null }> = ({ snapshot }) => {
  const rows = useMemo(() => {
    if (!snapshot) return [] as TopologyRow[];
    const topology = planToTopology(snapshot.plan);
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    for (const edge of topology.edges) {
      inbound.set(edge.to, (inbound.get(edge.to) ?? 0) + 1);
      outbound.set(edge.from, (outbound.get(edge.from) ?? 0) + 1);
    }
    return snapshot.topologyNodes.map((node) => ({
      node,
      inbound: inbound.get(node.nodeId) ?? 0,
      outbound: outbound.get(node.nodeId) ?? 0,
    }));
  }, [snapshot]);

  if (!snapshot) {
    return (
      <section style={{ border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
        <h3>Topology</h3>
        <p>No active snapshot.</p>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
      <h3>Topology</h3>
      <p>Nodes: {snapshot.topologyNodes.length}</p>
      <ul>
        {rows.map(({ node, inbound, outbound }) => (
          <li key={node.nodeId}>
            {node.label} · {node.stage} · actions:{node.actionCount} · c:{node.criticality} · in:{inbound} · out:{outbound}
          </li>
        ))}
      </ul>
      <p>Latest plan: {snapshot.plan.planId}</p>
    </section>
  );
};
