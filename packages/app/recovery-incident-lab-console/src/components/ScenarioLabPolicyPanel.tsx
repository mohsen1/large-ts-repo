import { type ReactElement, type MouseEvent, useMemo, useState } from 'react';
import { type PolicyInsightsOutput } from '../hooks/useRecoveryIncidentLabPolicyInsights';
import { type OrchestratorOutput } from '@service/recovery-incident-lab-orchestrator';

interface Props {
  readonly output?: OrchestratorOutput;
  readonly planReady: boolean;
  readonly insights: PolicyInsightsOutput;
  readonly onRefresh: () => void;
}

const healthClass = (health: PolicyInsightsOutput['executionHealth']): string => {
  if (health === 'healthy') {
    return 'ok';
  }
  if (health === 'degraded') {
    return 'warn';
  }
  if (health === 'failed') {
    return 'critical';
  }
  return 'idle';
};

export const ScenarioLabPolicyPanel = ({ output, planReady, insights, onRefresh }: Props): ReactElement => {
  const [expanded, setExpanded] = useState(false);

  const score = useMemo(() => {
    if (!planReady) {
      return 0;
    }

    const ratio = (insights.policyDensity + insights.topologyCoverage + insights.scenarioRiskScore) / 3;
    return Math.max(0, Math.min(100, ratio));
  }, [planReady, insights.policyDensity, insights.topologyCoverage, insights.scenarioRiskScore]);

  const onToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setExpanded((current) => !current);
  };

  return (
    <section className="scenario-lab-policy-panel">
      <header>
        <h2>Policy governance</h2>
        <button type="button" onClick={onToggle}>
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </header>
      <p>Readiness score: {score.toFixed(1)}</p>
      <p>Execution state: {insights.executionHealth}</p>
      <p className={`status ${healthClass(insights.executionHealth)}`}>coverage: {insights.topologyCoverage.toFixed(1)}%</p>
      <p>window count: {insights.windows.length}</p>
      <div>
        <button type="button" disabled={!planReady} onClick={onRefresh}>
          Recalculate policy view
        </button>
      </div>
      {output && <p>Last run id: {output.run.runId}</p>}
      <ul>
        {insights.nextActionPlan.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {expanded && (
        <dl>
          <dt>Total signals</dt>
          <dd>{insights.signalDigest.total}</dd>
          <dt>Critical signals</dt>
          <dd>{insights.signalDigest.critical}</dd>
          <dt>High signals</dt>
          <dd>{insights.signalDigest.high}</dd>
          <dt>Medium signals</dt>
          <dd>{insights.signalDigest.medium}</dd>
          <dt>Low signals</dt>
          <dd>{insights.signalDigest.low}</dd>
        </dl>
      )}
    </section>
  );
};
