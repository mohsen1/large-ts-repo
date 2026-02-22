import { useState } from 'react';
import { RunControls } from '../components/RunControls';
import { RunHistoryPanel } from '../components/RunHistoryPanel';
import { RunSummaryStrip } from '../components/RunSummaryStrip';
import { useAdaptiveOpsDashboard } from '../hooks/useAdaptiveOpsDashboard';
import { AdaptiveOpsRunFilter } from '../hooks/useAdaptiveOpsDashboard';
import { AdaptiveOpsCoveragePanel } from '../components/AdaptiveOpsCoveragePanel';
import { AdaptiveOpsForecastPanel } from '../components/AdaptiveOpsForecastPanel';
import { AdaptiveOpsForecastPage } from './AdaptiveOpsForecastPage';
import { AdaptiveOpsOrchestrator } from '@service/adaptive-ops-orchestrator';

interface AdaptiveOpsStudioPageProps {
  initialFilter?: AdaptiveOpsRunFilter;
}

const toDefaultTenant = () => `tenant-${Math.floor(Math.random() * 100) + 1}`;

export const AdaptiveOpsStudioPage = ({ initialFilter }: AdaptiveOpsStudioPageProps) => {
  const {
    state,
    filter,
    setWindowMs,
    setMaxActions,
    setDryRun,
    togglePolicy,
    execute,
    actionCounts,
    clearErrors,
  } = useAdaptiveOpsDashboard(initialFilter);

  const [showForecast, setShowForecast] = useState(false);
  const [tenantId, setTenantId] = useState(initialFilter?.tenantId ?? 'tenant-a');

  const toggleForecast = () => setShowForecast((current) => !current);

  return (
    <main className="adaptive-ops-studio">
      <header>
        <h1>Adaptive Operations Studio</h1>
        <button onClick={clearErrors} disabled={state.errors.length === 0}>
          Clear errors
        </button>
        <button onClick={() => setTenantId(toDefaultTenant())}>New tenant</button>
        <button onClick={toggleForecast}>{showForecast ? 'Hide Forecast' : 'Show Forecast'}</button>
      </header>
      <RunControls
        policies={state.policies}
        selectedPolicies={state.selectedPolicies}
        filter={filter}
        running={state.running}
        onTogglePolicy={togglePolicy}
        onWindowChange={setWindowMs}
        onMaxActionsChange={setMaxActions}
        onDryRunChange={setDryRun}
        onExecute={execute}
      />
      <RunSummaryStrip summaries={state.summaries} />
      <AdaptiveOpsCoveragePanel
        snapshot={{
          tenantId,
          runId: `studio:${tenantId}:${Date.now()}`,
          score: actionCounts.conflictsTotal,
          riskTier: actionCounts.decisionsInWindow > 10 ? 'critical' : actionCounts.decisionsInWindow > 3 ? 'attention' : 'safe',
          details: `${actionCounts.policyRecords.length} policies · ${actionCounts.actionRecords.length} actions`,
        }}
        loading={state.running}
        onRefresh={() => {
          void AdaptiveOpsOrchestrator.create()
            .loadHistory(tenantId)
            .then(() => undefined)
            .catch(() => undefined);
        }}
      />
      <section className="studio-metrics">
        <article>
          <h3>Signals</h3>
          <p>{state.summaries.length}</p>
        </article>
        <article>
          <h3>Actions</h3>
          <p>{actionCounts.decisionsInWindow}</p>
        </article>
        <article>
          <h3>Conflicts</h3>
          <p>{actionCounts.conflictsTotal}</p>
        </article>
      </section>
      <RunHistoryPanel state={state} />
      <section className="action-matrix">
        <h3>Action snapshot</h3>
        <table>
          <thead>
            <tr>
              <th>Policy</th>
              <th>Tenant</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {actionCounts.policyRecords.map((record) => (
              <tr key={`${record.tenantId}-${record.policyId}`}>
                <td>{record.policyId}</td>
                <td>{record.tenantId}</td>
                <td>{record.confidence.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="action-list">
        <h3>Top actions</h3>
        <ul>
          {actionCounts.actionRecords.map((record) => (
            <li key={`${record.target}-${record.type}-${record.intensity}`}>
              <strong>{record.type}</strong>
              <span>{record.target}</span>
              <small>{record.intensity.toFixed(2)}</small>
              <p>{record.justification}</p>
            </li>
          ))}
        </ul>
      </section>

      {showForecast ? <AdaptiveOpsForecastPage tenantId={tenantId} /> : null}
    </main>
  );
};
