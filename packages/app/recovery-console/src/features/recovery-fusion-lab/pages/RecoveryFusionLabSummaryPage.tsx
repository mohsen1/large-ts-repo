import { memo } from 'react';

import { useRecoveryFusionLabWorkspace } from '../hooks/useRecoveryFusionLabWorkspace';
import { FusionLabPolicyPanel } from '../components/FusionLabPolicyPanel';
import { FusionLabTopologyDeck } from '../components/FusionLabTopologyDeck';
import { mockTopology } from '../mocks';

const toTimelineRows = (values: readonly string[]): readonly { readonly at: string; readonly value: string }[] =>
  values.map((value, index) => ({
    at: `${new Date().toISOString()}:${index}`,
    value,
  }));

export const RecoveryFusionLabSummaryPage = ({ tenant = 'tenant:global', workspace = 'lab-workspace' }: {
  tenant?: string;
  workspace?: string;
}) => {
  const { state, result } = useRecoveryFusionLabWorkspace(tenant, workspace);
  const timeline = toTimelineRows(result ? result.commandTrace : []);

  return (
    <main>
      <h2>Fusion Lab Summary</h2>
      <FusionLabPolicyPanel state={state} />
      <section>
        <h3>Topology Snapshot</h3>
        <FusionLabTopologyDeck nodes={mockTopology} onSelect={() => {}} selectedId={mockTopology.at(0)?.id} />
      </section>
      <section>
        <h3>Execution Trace</h3>
        <ul>
          {timeline.length === 0 ? (
            <li>No timeline events yet.</li>
          ) : (
            timeline.map((entry) => (
              <li key={entry.at}>
                <code>{entry.at}</code>: {entry.value}
              </li>
            ))
          )}
        </ul>
      </section>
      <p>Events: {timeline.length}</p>
    </main>
  );
};
