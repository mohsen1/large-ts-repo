import { type ConductorWorkspaceSummary } from '../types';

interface ConductorTopologyPanelProps {
  readonly workspace: ConductorWorkspaceSummary;
}

export const ConductorTopologyPanel = ({ workspace }: ConductorTopologyPanelProps) => {
  const readinessRatio = workspace.runbooks.length === 0 ? 0 : Math.min(workspace.runbooks.length / 5, 1);
  const signalCount = workspace.signals.length;
  const severityBuckets = {
    critical: workspace.signals.filter((signal) => signal.severity === 'critical').length,
    high: workspace.signals.filter((signal) => signal.severity === 'high').length,
    medium: workspace.signals.filter((signal) => signal.severity === 'medium').length,
    low: workspace.signals.filter((signal) => signal.severity === 'low').length,
  };
  const readiness = Math.max(0, 100 - Math.min(100, signalCount * 14 + severityBuckets.critical * 20));

  return (
    <section>
      <h2>Conductor topology</h2>
      <p>{`runbooks: ${workspace.runbooks.length}`}</p>
      <p>{`signals: ${signalCount}`}</p>
      <p>{`readiness: ${readiness}%`}</p>
      <p>{`readiness ratio: ${readinessRatio}`}</p>
      <ul>
        <li>{`critical: ${severityBuckets.critical}`}</li>
        <li>{`high: ${severityBuckets.high}`}</li>
        <li>{`medium: ${severityBuckets.medium}`}</li>
        <li>{`low: ${severityBuckets.low}`}</li>
      </ul>
      <details>
        <summary>runbook names</summary>
        <ul>
          {workspace.runbooks.map((runbook) => (
            <li key={runbook.id}>{`${runbook.name} (${runbook.commandCount})`}</li>
          ))}
        </ul>
      </details>
    </section>
  );
};
