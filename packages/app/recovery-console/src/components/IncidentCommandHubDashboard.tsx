import { useMemo } from 'react';
import type { CommandWindowPrediction } from '@domain/recovery-operations-models/command-window-forecast';
import { useRecoveryCommandHub } from '../hooks/useRecoveryCommandHub';
import { useRecoveryCommandCadence } from '../hooks/useRecoveryCommandCadence';

interface IncidentCommandHubDashboardProps {
  readonly initialTenant: string;
}

const buildProbabilityStyle = (value: number): string => {
  if (value > 0.75) {
    return 'status-high';
  }
  if (value > 0.45) {
    return 'status-medium';
  }
  return 'status-low';
};

const metricsToText = (prediction: CommandWindowPrediction): string => {
  const lines = [
    `probability=${prediction.probability.toFixed(2)}`,
    `forecastSamples=${prediction.forecast.samples.length}`,
    `risks=${prediction.recommendedActions.join(';')}`,
    `windowId=${prediction.forecast.windowId}`,
  ];
  return lines.join(' | ');
};

export const IncidentCommandHubDashboard = ({ initialTenant }: IncidentCommandHubDashboardProps) => {
  const hub = useRecoveryCommandHub();
  const cadence = useRecoveryCommandCadence();

  const predictionLines = useMemo(() => {
    return hub.state.predictions.map((prediction) => ({
      prediction,
      summary: metricsToText(prediction),
      style: buildProbabilityStyle(prediction.probability),
    }));
  }, [hub.state.predictions]);

  const onRunQuick = async () => {
    await hub.runPipeline({
      tenant: initialTenant,
      commandSeed: {
        commandId: `cmd-${initialTenant}-${Date.now()}`,
        tenant: initialTenant,
        owner: 'ops-auto',
        title: `Automated recovery ${new Date().toISOString()}`,
        description: 'run automation generated command with synthetic inputs',
        category: 'compliance',
        severity: 'normal',
        tags: ['auto', 'synthetic', initialTenant],
      },
      stageCount: 5,
    });
    await cadence.loadCadence();
  };

  const onRefresh = async () => {
    await Promise.all([hub.refreshSummary(), cadence.refresh()]);
  };

  return (
    <section className="incident-command-hub-dashboard">
      <header>
        <h2>Incident Command Hub</h2>
        <p>{hub.state.summary ? `commands=${hub.state.summary.totalArtifacts}` : 'loading summary...'}</p>
        {hub.state.summary ? <p>{`critical=${hub.state.summary.criticalWindowCount} active=${hub.state.summary.activeCommandCount}`}</p> : null}
      </header>

      <div className="actions">
        <button type="button" onClick={onRefresh} disabled={hub.state.loading || cadence.state.loading}>
          Refresh
        </button>
        <button type="button" onClick={onRunQuick} disabled={hub.state.loading || hub.state.isBusy}>
          Run quick simulation
        </button>
        <button type="button" onClick={() => void hub.executeCommand()}>
          Execute command
        </button>
      </div>

      {hub.state.error ? <p role="alert">{hub.state.error}</p> : null}

      <section>
        <h3>Predictions ({predictionLines.length})</h3>
        <ul>
          {predictionLines.map((entry) => (
            <li key={entry.prediction.forecast.windowId} className={entry.style}>
              <strong>{entry.prediction.forecast.windowId}</strong>
              <span>{entry.summary}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Cadence issues ({cadence.state.cadenceIssues.length})</h3>
        <ul>
          {cadence.state.cadenceIssues.map((issue) => (
            <li key={issue.commandId}>
              {issue.commandId} stageCount={issue.stageCount} breach={issue.atRiskStageCount}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => void cadence.escalate()} disabled={cadence.state.loading}>
          Escalate risky cadence
        </button>
      </section>

      {cadence.state.escalationActions.length > 0 ? (
        <section>
          <h3>Escalation actions</h3>
          <ol>
            {cadence.state.escalationActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
};
