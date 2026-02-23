import { useState } from 'react';
import type { DriftObservation, CommandNetworkSnapshot, RuntimeIntent } from '@domain/recovery-command-network';
import { defaultFilter } from '../types/commandNetworkPage';
import { evaluateHealth } from '../services/healthStore';
import { useCommandNetworkSignals } from '../hooks/useCommandNetworkSignals';
import { PolicyDriftBanner } from '../components/PolicyDriftBanner';
import { CommandNetworkTopology } from '../components/CommandNetworkTopology';

interface CommandNetworkWorkspacePageProps {
  readonly snapshot: CommandNetworkSnapshot;
  readonly intents: readonly RuntimeIntent[];
  readonly drifts: readonly DriftObservation[];
}

export const CommandNetworkWorkspacePage = ({ snapshot, intents, drifts }: CommandNetworkWorkspacePageProps) => {
  const [policyId, setPolicyId] = useState<string>(snapshot.policies[0]?.policyId ?? 'all');
  const health = evaluateHealth(snapshot);
  const { acceptedCount, rejectedCount } = useCommandNetworkSignals(snapshot, intents, [], drifts, {
    policyId,
    minScore: 0.5,
  });

  const summary = `${snapshot.networkId} with ${snapshot.nodes.length} nodes and ${snapshot.edges.length} edges`;

  return (
    <article className="command-network-workspace">
      <header>
        <h1>Network Workspace</h1>
        <p>{summary}</p>
        <p>{health.policySummary}</p>
        <p>{health.score.toFixed(3)} score ({health.status})</p>
      </header>

      <label>
        Policy
        <select value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
          <option value="all">All</option>
          {snapshot.policies.map((policy) => (
            <option key={policy.policyId} value={policy.policyId}>
              {policy.name}
            </option>
          ))}
        </select>
      </label>

      <PolicyDriftBanner drifts={drifts} maxItems={defaultFilter.maxNodes} />

      <section>
        <h2>Decision surface</h2>
        <p>Accepted: {acceptedCount}</p>
        <p>Rejected: {rejectedCount}</p>
      </section>

      <CommandNetworkTopology
        snapshot={snapshot}
        selectedWave={snapshot.waves[0] ?? null}
        onNodeSelect={() => {}}
        activePolicyId={policyId}
        onPolicySelect={setPolicyId}
      />

      <pre>{JSON.stringify({
        nodes: snapshot.nodes.length,
        edges: snapshot.edges.length,
        policies: snapshot.policies.length,
        issues: drifts.length,
      }, null, 2)}</pre>
    </article>
  );
};
