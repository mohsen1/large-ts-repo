import { useState } from 'react';
import { useWorkloadOrchestration } from '../hooks/useWorkloadOrchestration';
import { useAdaptiveOpsDashboard } from '../hooks/useAdaptiveOpsDashboard';
import { WorkloadTopologyPanel } from '../components/workload/WorkloadTopologyPanel';
import { WorkloadForecastSummary } from '../components/workload/WorkloadForecastSummary';
import { WorkloadSignalPanel } from '../components/workload/WorkloadSignalPanel';

export const WorkloadOperationsCenterPage = () => {
  const [tenantId, setTenantId] = useState('tenant-a');
  const adaptiveOps = useAdaptiveOpsDashboard();
  const {
    filter,
    state,
    viewRows,
    topology,
    setRegion,
    setCriticalOnly,
    execute,
    reload,
    setTenant,
    history,
    aggregateByScopeReport,
    graph,
    state: orchestrationState,
    setTenant: setWorkloadTenant,
  } = useWorkloadOrchestration({
    tenantId,
    region: 'all',
    showOnlyCritical: false,
  });

  const scopeRows = [...aggregateByScopeReport].map((entry) => `${entry.key.scope}/${entry.key.region}: ${entry.nodeCount} nodes`);
  const isCriticalOnly = filter.showOnlyCritical;

  return (
    <main className="workload-operations-center">
      <header>
        <h1>Workload Operations Center</h1>
        <p>{tenantId}</p>
      </header>
      <section className="workload-controls">
        <label>
          Tenant
          <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
        </label>
        <label>
          Region
          <select
            value={filter.region}
            onChange={(event) => {
              const value = event.target.value as typeof filter.region;
              setRegion(value);
            }}
          >
            <option value="all">All</option>
            <option value="us-east-1">us-east-1</option>
            <option value="us-west-2">us-west-2</option>
            <option value="eu-west-1">eu-west-1</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={isCriticalOnly}
            onChange={(event) => setCriticalOnly(event.target.checked)}
          />
          critical only
        </label>
        <button onClick={() => { setTenant(tenantId); }}>Load tenant</button>
        <button onClick={reload}>Seed new data</button>
        <button onClick={() => {
          void setWorkloadTenant(tenantId);
        }}>
          Use tenant across views
        </button>
      </section>
      <section className="workload-summary-grid">
        <WorkloadForecastSummary
          tenantId={tenantId}
          plans={orchestrationState.plans}
          warnings={orchestrationState.warnings}
          coverage={orchestrationState.coverage}
          queue={orchestrationState.queue}
          onRunAgain={() => {
            void execute();
          }}
        />
        <WorkloadSignalPanel dashboard={adaptiveOps.state} workload={orchestrationState} />
      </section>
      <WorkloadTopologyPanel graph={graph} />
      <section className="workload-history">
        <h3>Signal history</h3>
        <ul>
          {viewRows.map((row) => (
            <li key={row.nodeId}>
              <strong>{row.nodeName}</strong>
              <span>risk={row.riskSignal.toFixed(2)} active={row.activeForecastCount}</span>
            </li>
          ))}
        </ul>
        <p>Coverage buckets: {topology.layers.length}</p>
        <p>Snapshot points: {history.snapshotCount}</p>
        <p>Coverage hot alerts: {history.alerts}</p>
        <p>Topology nodes: {topology.nodes.length}</p>
      </section>
      <section>
        <h3>Scope rows</h3>
        <ol>
          {scopeRows.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ol>
      </section>
      <button onClick={() => {
        void execute();
      }}>
        Execute orchestration
      </button>
      {orchestrationState.error !== null && (
        <section className="errors">
          <h3>Errors</h3>
          <ul>
            <li key={orchestrationState.error}>{orchestrationState.error}</li>
          </ul>
        </section>
      )}
    </main>
  );
};
