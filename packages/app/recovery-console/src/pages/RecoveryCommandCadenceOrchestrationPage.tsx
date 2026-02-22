import { useMemo, useState } from 'react';
import { CommandWindowTimeline } from '../components/CommandWindowTimeline';
import { buildRecoveryCommandOrchestrator } from '@service/recovery-operations-engine/command-hub-orchestrator';
import { buildCadencePlan, snapshotCadence } from '@domain/recovery-operations-models/control-plane-cadence';
import { buildWindowFromSamples } from '@domain/recovery-operations-models/command-window-forecast';
import { withBrand } from '@shared/core';

interface OrchestrationSnapshot {
  readonly tenant: string;
  readonly commandId: string;
  readonly issueCount: number;
}

const seedSamples = [
  {
    sampleId: withBrand('seed', 'CommandWindowSampleId'),
    commandId: withBrand('seed-command', 'CommandArtifactId'),
    state: 'open' as const,
    startedAt: new Date().toISOString(),
    contributors: [{ area: 'seed', impact: 7 }],
    metrics: [
      {
        metricId: withBrand('seed-metric', 'CommandWindowMetricId'),
        name: 'seed-health',
        value: 0.82,
        weight: 1,
        unit: 'score' as const,
        goodDirection: 'higher' as const,
      },
      {
        metricId: withBrand('seed-metric-2', 'CommandWindowMetricId'),
        name: 'seed-availability',
        value: 0.71,
        weight: 1,
        unit: 'percent' as const,
        goodDirection: 'higher' as const,
      },
    ],
  },
  {
    sampleId: withBrand('seed-2', 'CommandWindowSampleId'),
    commandId: withBrand('seed-command', 'CommandArtifactId'),
    state: 'active' as const,
    startedAt: new Date().toISOString(),
    contributors: [{ area: 'seed', impact: 12 }],
    metrics: [
      {
        metricId: withBrand('seed-metric-3', 'CommandWindowMetricId'),
        name: 'seed-latency',
        value: 1_200,
        weight: 1,
        unit: 'duration-ms' as const,
        goodDirection: 'lower' as const,
      },
    ],
  },
];

export const RecoveryCommandCadenceOrchestrationPage = () => {
  const orchestrator = useMemo(() => buildRecoveryCommandOrchestrator(), []);
  const [tenant, setTenant] = useState('global');
  const [commandId, setCommandId] = useState('seed-command');
  const [issues, setIssues] = useState<readonly OrchestrationSnapshot[]>([]);

  const forecast = useMemo(() => {
    const commandWindowForecast = buildWindowFromSamples(
      seedSamples,
      withBrand(tenant, 'TenantId'),
      withBrand(commandId, 'CommandArtifactId'),
    );

    return [commandWindowForecast];
  }, [tenant, commandId]);

  const issuesSummary = useMemo(() => {
    const plan = buildCadencePlan(withBrand(tenant, 'TenantId'), withBrand(commandId, 'CommandArtifactId'), 6);
    const snapshot = snapshotCadence(plan);
    const count = snapshot.atRiskStageCount;
    return [{ tenant, commandId, issueCount: count }];
  }, [tenant, commandId]);

  const runDiagnostic = async () => {
    const issuesResult = await orchestrator.diagnoseCadenceIssues(tenant);
    if (!issuesResult.ok) {
      setIssues([]);
      return;
    }
    const next = issuesResult.value.map((issue) => ({
      tenant,
      commandId: issue.commandId,
      issueCount: issue.atRiskStages,
    }));
    setIssues(next);
  };

  return (
    <section className="recovery-command-cadence-orchestration-page">
      <h1>Recovery command cadence orchestration</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label>
          Tenant
          <input value={tenant} onChange={(event) => setTenant(event.target.value)} />
        </label>
        <label>
          Command
          <input value={commandId} onChange={(event) => setCommandId(event.target.value)} />
        </label>
      </form>
      <button type="button" onClick={() => void runDiagnostic()}>
        Run diagnostic
      </button>

      <section>
        <h2>Issue summary</h2>
        <ul>
          {issuesSummary.map((entry) => (
            <li key={`${entry.tenant}:${entry.commandId}`}>
              {entry.tenant}/{entry.commandId}: {entry.issueCount} issue(s)
            </li>
          ))}
          {issues.map((entry) => (
            <li key={`diag:${entry.commandId}`}>
              diag {entry.commandId} count={entry.issueCount}
            </li>
          ))}
        </ul>
      </section>

      {forecast.map((entry) => (
        <CommandWindowTimeline
          key={entry.windowId}
          title={`Forecast ${entry.windowId}`}
          samples={entry.samples}
        />
      ))}
    </section>
  );
};
