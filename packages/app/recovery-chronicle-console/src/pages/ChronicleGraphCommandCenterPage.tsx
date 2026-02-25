import { useState, type ReactElement } from 'react';
import { asChronicleGraphRoute, asChronicleGraphTenantId, type ChronicleGraphPhase } from '@domain/recovery-chronicle-graph-core';
import { useChronicleGraphSession } from '../hooks/useChronicleGraphSession';
import { resolveGraphScenario, normalizeGraphScenario } from '../components/chronicle-graph/graph-utils';
import { ChronicleGraphTopology } from '../components/chronicle-graph/ChronicleGraphTopology';
import { ChronicleGraphTimelinePanel } from '../components/chronicle-graph/ChronicleGraphTimelinePanel';

const defaultPhases = ['phase:bootstrap', 'phase:execution', 'phase:verification'] as const;

export const ChronicleGraphCommandCenterPage = (): ReactElement => {
  const [selectedNode, setSelectedNode] = useState('graph-node:bootstrap');
  const [route, setRoute] = useState('chronicle-graph://studio');
  const tenant = asChronicleGraphTenantId('tenant:studio');
  const currentRoute = asChronicleGraphRoute(route);
  const scenario = normalizeGraphScenario(tenant, currentRoute, defaultPhases as unknown as readonly ChronicleGraphPhase<string>[]) .scenario;
  const { state, isActive, run, stop } = useChronicleGraphSession(
    'tenant:studio',
    currentRoute,
    defaultPhases as unknown as readonly ChronicleGraphPhase<string>[],
  );
  const descriptor = resolveGraphScenario(
    tenant,
    currentRoute,
    defaultPhases as unknown as readonly ChronicleGraphPhase<string>[],
  );

  const blueprint = scenario.blueprint;

  return (
    <main>
      <h1>Graph Command Center</h1>
      <section>
        <button type="button" onClick={() => void run()}>
          Start Session
        </button>
        <button type="button" onClick={() => void stop()}>
          Stop Session
        </button>
        <button type="button" onClick={() => setRoute('chronicle-graph://timeline')}>
          Timeline Route
        </button>
        <button type="button" onClick={() => setRoute('chronicle-graph://policy')}>
          Policy Route
        </button>
      </section>

      <p>Session active: {String(isActive)}</p>
      <p>Current route: {route}</p>
      <p>Descriptor: {descriptor.title}</p>

      <ChronicleGraphTopology
        blueprint={blueprint}
        status={state.active ? 'running' : 'pending'}
        onSelectNode={(nodeId) => {
          setSelectedNode(String(nodeId));
        }}
      />

      <ChronicleGraphTimelinePanel
        status={state.active ? 'running' : 'pending'}
        onSelect={(index, value) => {
          console.log('select', index, value);
        }}
      />

      <section>
        <h2>Selected Node</h2>
        <p>{selectedNode}</p>
      </section>
    </main>
  );
};
