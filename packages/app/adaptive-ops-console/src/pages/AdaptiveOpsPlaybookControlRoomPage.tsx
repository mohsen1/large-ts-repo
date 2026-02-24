import { useMemo } from 'react';
import { useAdaptiveOpsPlaybook } from '../hooks/useAdaptiveOpsPlaybook';
import { PlaybookControlPanel } from '../components/playbook/PlaybookControlPanel';
import { PlaybookDependencyGraph } from '../components/playbook/PlaybookDependencyGraph';
import { PlaybookTelemetryPanel } from '../components/playbook/PlaybookTelemetryPanel';
import { SignalKind } from '@domain/adaptive-ops';
import { AdaptivePolicy } from '@domain/adaptive-ops';

const samplePolicies: AdaptivePolicy[] = [
  {
    id: 'policy-playbook-1' as never,
    tenantId: 'tenant-a' as never,
    name: 'Latency first response',
    active: true,
    dependencies: [
      {
        serviceId: 'api-gateway' as never,
        required: true,
        resilienceBudget: 0.9,
      },
      {
        serviceId: 'identity-service' as never,
        required: false,
        resilienceBudget: 0.65,
      },
    ],
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      zone: 'utc',
    },
    allowedSignalKinds: ['error-rate', 'latency', 'availability'],
    driftProfile: {
      dimensions: ['error-rate', 'latency'],
      expectedDirection: 'up',
      threshold: 1.2,
      tolerance: 0.2,
    },
  },
  {
    id: 'policy-playbook-2' as never,
    tenantId: 'tenant-a' as never,
    name: 'Cost drift shield',
    active: true,
    dependencies: [
      {
        serviceId: 'api-cache' as never,
        required: true,
        resilienceBudget: 0.7,
      },
      {
        serviceId: 'worker' as never,
        required: true,
        resilienceBudget: 0.5,
      },
    ],
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      zone: 'utc',
    },
    allowedSignalKinds: ['cost-variance', 'manual-flag'],
  },
];

export const AdaptiveOpsPlaybookControlRoomPage = () => {
  const {
    tenantId,
    preferredKinds,
    maxActions,
    running,
    lastError,
    updateTenant,
    updateKinds,
    updateMaxActions,
    executePlaybook,
    lastResult,
    history,
  } = useAdaptiveOpsPlaybook();

  const outcome = lastResult.outcome;
  const forecast = lastResult.forecast;

  const runId = outcome?.runId ?? null;
  const allLabels = useMemo(
    () => [...new Set([...(outcome?.pluginSummary.riskSignals ?? []), ...preferredKinds])],
    [outcome, preferredKinds],
  );

  const handleExecute = async () => {
    await executePlaybook(samplePolicies);
  };

  return (
    <main className="adaptive-ops-playbook-page">
      <header>
        <h1>Adaptive Operations Playbook Control Room</h1>
        <p>Execute synthetic policy playbooks and inspect runtime graph/telemetry.</p>
      </header>

      <PlaybookControlPanel
        tenantId={tenantId}
        maxActions={maxActions}
        preferredKinds={preferredKinds}
        running={running}
        lastError={lastError}
        onTenantChange={updateTenant}
        onKindsChange={updateKinds}
        onMaxActionsChange={updateMaxActions}
        onExecute={handleExecute}
      />

      <section className="playbook-summary">
        <h2>Latest run</h2>
        <p>Run id: {runId ?? 'none'}</p>
        <p>Tenant: {tenantId}</p>
        <p>Policy count: {samplePolicies.length}</p>
        <p>Warnings: {(outcome?.pluginSummary.warnings.length ?? 0).toString()}</p>
      </section>

      <PlaybookDependencyGraph policies={samplePolicies} decisions={outcome?.decisions ?? []} />

      <PlaybookTelemetryPanel
        snapshot={
          outcome
            ? {
                tenantId,
                runId: runId ?? 'pending',
                score: outcome.actions.length + outcome.traces.length,
                riskTier: outcome.pluginSummary.accepted > outcome.pluginSummary.rejected ? 'attention' : 'safe',
                details: `accepted=${outcome.pluginSummary.accepted}`,
              }
            : null
        }
        forecast={forecast}
        metricLabels={allLabels as string[]}
      />

      <section className="playbook-history">
        <h2>Run history</h2>
        <ul>
          {history.map((entry, index) => (
            <li key={`${index}-${entry.lastRunId ?? 'none'}`}>
              <strong>run #{index + 1}</strong>
              <span>
                {entry.loading
                  ? 'loading'
                  : entry.error
                    ? `err: ${entry.error}`
                    : entry.lastRunId
                      ? `run:${entry.lastRunId}`
                      : 'not-run'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
