import { useState } from 'react';

interface Props {
  readonly initialTenant: string;
  readonly onSubmit: (payload: { tenant: string; workspaceId: string; scenarioId: string }) => void;
}

export const RunWorkspaceToolbar = ({ initialTenant, onSubmit }: Props) => {
  const [tenant, setTenant] = useState(initialTenant);
  const [workspaceId, setWorkspaceId] = useState('ws-demo');
  const [scenarioId, setScenarioId] = useState('scenario-demo');

  return (
    <section style={{ border: '1px solid #ccc', padding: 12, marginBottom: 12, display: 'grid', gap: 8 }}>
      <label>
        Tenant
        <input value={tenant} onChange={(event) => setTenant(event.target.value)} />
      </label>
      <label>
        Workspace
        <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
      </label>
      <label>
        Scenario
        <input value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} />
      </label>
      <button type="button" onClick={() => onSubmit({ tenant, workspaceId, scenarioId })}>
        Execute recovery drill
      </button>
    </section>
  );
};
