import { type ChangeEvent, useMemo } from 'react';
import type { CommandNetworkNodeId, CommandNetworkSnapshot, CommandWave, PolicyRule } from '@domain/recovery-command-network';
import { summarizeGraph } from '../adapters/networkWorkspaceAdapter';

interface NodeSummary {
  readonly nodeId: string;
  readonly role: string;
  readonly state: string;
  readonly score: number;
}

interface CommandNetworkTopologyProps {
  readonly snapshot: CommandNetworkSnapshot | null;
  readonly selectedWave: CommandWave | null;
  readonly onNodeSelect: (nodeId: string) => void;
  readonly activePolicyId: string;
  readonly onPolicySelect: (policyId: string) => void;
}

const normalizeState = (value: number): 'ok' | 'warn' | 'critical' => {
  if (value >= 0.8) {
    return 'ok';
  }
  if (value >= 0.5) {
    return 'warn';
  }
  return 'critical';
};

export const CommandNetworkTopology = ({
  snapshot,
  selectedWave,
  onNodeSelect,
  activePolicyId,
  onPolicySelect,
}: CommandNetworkTopologyProps) => {
  const graphSummary = useMemo(() => {
    if (!snapshot) {
      return 'No snapshot';
    }
    return summarizeGraph({
      networkId: snapshot.networkId,
      nodesByRole: snapshot.nodes.reduce((acc, node) => {
        const bucket = acc[node.role] ?? [];
        return { ...acc, [node.role]: [...bucket, node.nodeId] };
      }, {
      ingest: [] as CommandNetworkNodeId[],
      plan: [] as CommandNetworkNodeId[],
      simulate: [] as CommandNetworkNodeId[],
      execute: [] as CommandNetworkNodeId[],
      audit: [] as CommandNetworkNodeId[],
      }),
      adjacency: Object.fromEntries(snapshot.nodes.map((node) => [node.nodeId, snapshot.edges.filter((edge) => edge.from === node.nodeId)])) as never,
      activePolicyIds: snapshot.policies.map((policy) => policy.policyId),
    });
  }, [snapshot]);

  const selectedNodes = useMemo(() => {
    if (!selectedWave) {
      return [] as NodeSummary[];
    }

    return selectedWave.nodeIds.map((nodeId) => ({
      nodeId,
      role: 'plan',
      state: normalizeState(Number(selectedWave.commandCount) / 100),
      score: Math.max(0, Math.min(1, Number(selectedWave.commandCount) / 16)),
    }));
  }, [selectedWave]);

  const policyOptions = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.policies.map((policy: PolicyRule) => ({
      id: policy.policyId,
      label: `${policy.name} (${policy.channels.length})`,
    }));
  }, [snapshot]);

  return (
    <section className="command-network-topology">
      <header>
        <h2>Command network topology</h2>
        <p>{graphSummary}</p>
      </header>

      <label>
        Policy filter
        <select value={activePolicyId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onPolicySelect(event.target.value)}>
          {policyOptions.map((policy) => (
            <option key={policy.id} value={policy.id}>{policy.label}</option>
          ))}
        </select>
      </label>

      <div className="topology-wave-summary">
        <h3>Wave nodes</h3>
        {selectedNodes.length === 0 ? <p>No selected wave</p> : null}
        <ul>
          {selectedNodes.map((node) => (
            <li key={node.nodeId}>
              <button type="button" onClick={() => onNodeSelect(node.nodeId)}>
                {node.nodeId} {node.role} {node.state} score={node.score.toFixed(2)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
