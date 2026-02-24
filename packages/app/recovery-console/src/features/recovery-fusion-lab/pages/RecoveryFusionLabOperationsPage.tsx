import { useState } from 'react';

import {
  FusionLabCommandRail,
  FusionLabPolicyPanel,
  FusionLabTopologyDeck,
} from '../components';
import { useRecoveryFusionLabWorkspace } from '../hooks/useRecoveryFusionLabWorkspace';
import { mockTopology } from '../mocks';

import type { FusionLabCommandAction } from '../types';

export const RecoveryFusionLabOperationsPage = ({ tenant = 'tenant:global', workspace = 'lab-workspace' }: {
  tenant?: string;
  workspace?: string;
}) => {
  const { request, result, state } = useRecoveryFusionLabWorkspace(tenant, workspace);
  const [selectedNode, setSelectedNode] = useState(mockTopology[0]?.id);

  const timelineSignals = result?.signals ?? [];
  const actionHandler = (_action: FusionLabCommandAction) => {
    void request;
  };

  return (
    <main>
      <header>
        <h1>Recovery Fusion Lab Operations</h1>
        <p>{state.workspace}</p>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <FusionLabTopologyDeck nodes={mockTopology} selectedId={selectedNode} onSelect={setSelectedNode} />
        <FusionLabPolicyPanel state={state} />
        <FusionLabCommandRail state={state} latestSignals={timelineSignals} onAction={actionHandler} />
      </section>
    </main>
  );
};
