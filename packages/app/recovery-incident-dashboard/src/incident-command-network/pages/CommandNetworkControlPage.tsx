import { useMemo, useState } from 'react';
import type { PolicyRule } from '@domain/recovery-command-network';
import { adaptWorkspace, toSignals, summarizePolicyNames, computeDecisionRate, summarizeGraph } from '../adapters/networkWorkspaceAdapter';
import { useCommandNetworkEngine } from '../hooks/useCommandNetworkEngine';
import { useCommandNetworkSignals } from '../hooks/useCommandNetworkSignals';
import { PolicyDriftBanner } from '../components/PolicyDriftBanner';
import { RunTimeline } from '../components/RunTimeline';
import { CommandNetworkTopology } from '../components/CommandNetworkTopology';
import { defaultFilter, type CommandNetworkDashboardState } from '../types/commandNetworkPage';

interface CommandNetworkControlPageProps {
  readonly snapshot: CommandNetworkDashboardState['snapshot'];
  readonly intents: CommandNetworkDashboardState['plans'];
  readonly policyNames: readonly PolicyRule[];
}

export const CommandNetworkControlPage = ({ snapshot, intents, policyNames }: CommandNetworkControlPageProps) => {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(policyNames[0]?.policyId ?? 'none');
  const [selectedWaveIndex, setSelectedWaveIndex] = useState(0);

  const engine = useCommandNetworkEngine(snapshot, intents);
  const filteredSignals = useCommandNetworkSignals(snapshot, intents, engine.state.decisions, engine.state.snapshot?.nodes.flatMap(() => []) as any, {
    policyId: selectedPolicyId,
    minScore: defaultFilter.maxEdges / 10,
  });

  const summary = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const workspace = adaptWorkspace(snapshot, intents);
    const rates = computeDecisionRate(engine.state.decisions);
    return {
      workspace,
      rates,
      policyNames: summarizePolicyNames(snapshot.policies),
    };
  }, [intents, snapshot, engine.state.decisions]);

  if (!snapshot) {
    return <p>No snapshot loaded</p>;
  }

  return (
    <div className="command-network-control">
      <header>
        <h1>Command Network Control</h1>
        <p>{summarizeGraph({
          networkId: snapshot.networkId,
          nodesByRole: { ingest: [], plan: [], simulate: [], execute: [], audit: [] },
          adjacency: {},
          activePolicyIds: snapshot.policies.map((policy) => policy.policyId),
        })}</p>
      </header>

      <section className="command-network-summary">
        <h2>Workspace summary</h2>
        <p>{summary?.workspace?.planCount} plans</p>
        <p>{summary?.workspace?.graphSummary}</p>
        <p>{summary?.workspace?.routeSummary}</p>
        <p>{summary?.policyNames}</p>
        <button type="button" onClick={engine.refresh}>Refresh engine</button>
      </section>

      <RunTimeline
        intents={intents}
        decisions={engine.state.decisions}
        drifts={[]}
        maxRows={defaultFilter.maxNodes}
      />

      <PolicyDriftBanner drifts={[]} />

      <CommandNetworkTopology
        snapshot={snapshot}
        selectedWave={snapshot.waves[Number.isFinite(selectedWaveIndex) ? selectedWaveIndex : 0] ?? null}
        onNodeSelect={(nodeId) => setSelectedPolicyId(nodeId)}
        activePolicyId={selectedPolicyId}
        onPolicySelect={(policyId) => {
          setSelectedPolicyId(policyId);
          void engine.refresh();
        }}
      />

      <section>
        <h3>Signals</h3>
        <p>Accepted: {filteredSignals.acceptedCount}</p>
        <p>Rejected: {filteredSignals.rejectedCount}</p>
        <pre>{JSON.stringify(toSignals(engine.state.decisions), null, 2)}</pre>
      </section>
    </div>
  );
};
