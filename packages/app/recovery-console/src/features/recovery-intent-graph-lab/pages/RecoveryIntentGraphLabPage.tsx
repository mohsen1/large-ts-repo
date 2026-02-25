import { useState } from 'react';
import { IntentGraphCanvas } from '../components/IntentGraphCanvas';
import { IntentPolicyPanel } from '../components/IntentPolicyPanel';
import { IntentSignalFeed } from '../components/IntentSignalFeed';
import { useRecoveryIntentGraphLab } from '../hooks/useRecoveryIntentGraphLab';
import { type IntentRoute } from '../types';

interface RecoveryIntentGraphLabPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

const routeOptions: IntentRoute[] = ['intent:bootstrap', 'intent:classify', 'intent:resolve', 'intent:observe'];

export const RecoveryIntentGraphLabPage = ({ tenant, workspace }: RecoveryIntentGraphLabPageProps) => {
  const { workspace: workspaceState, summary, signals, loading, error, refresh, execute, reset, setRoute, setThrottle, toggleDiagnostics, form } =
    useRecoveryIntentGraphLab({ tenant, workspace, route: 'intent:bootstrap' });
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);

  return (
    <main>
      <header>
        <h1>Recovery Intent Graph Lab</h1>
        <p>{`tenant=${tenant} workspace=${workspace}`}</p>
        {error ? <p role="alert">{error}</p> : null}
      </header>
      <section>
        <label>
          Route
          <select value={form.selectedRoute} onChange={(event) => setRoute(event.currentTarget.value as IntentRoute)}>
            {routeOptions.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </label>
        <label>
          Throttle
          <input
            value={form.throttleMs}
            onChange={(event) => setThrottle(Number(event.currentTarget.value || 0))}
            type="number"
            min={50}
            max={2000}
            step={25}
          />
        </label>
      </section>
      <section>
        <button onClick={refresh} type="button" disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button onClick={execute} type="button" disabled={loading}>
          Execute
        </button>
        <button onClick={reset} type="button">
          Reset
        </button>
      </section>
      <IntentPolicyPanel
        summary={summary}
        workspace={workspaceState}
        pluginNames={workspaceState.pluginNames}
        onToggleDiagnostics={toggleDiagnostics}
        includeDiagnostics={form.includeDiagnostics}
      />
      <IntentGraphCanvas
        nodes={workspaceState.nodes}
        edges={workspaceState.edges}
        onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
      />
      <IntentSignalFeed signals={signals} max={16} />
      <section>
        <h2>Selection</h2>
        <p>{selectedNodeId ?? 'none selected'}</p>
      </section>
      <section>
        <h2>Messages</h2>
        <ol>
          {workspaceState.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ol>
      </section>
    </main>
  );
};
