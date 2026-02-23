import { FC } from 'react';
import { WorkloadPlan } from '../hooks/useCockpitWorkloadPlanner';

export type ForecastWorkspaceProps = {
  activeSummary: WorkloadPlan | null;
  onRunPreview: (planId: string) => void;
};

export const ForecastWorkspace: FC<ForecastWorkspaceProps> = ({ activeSummary, onRunPreview }) => {
  if (!activeSummary) {
    return (
      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <h2>Forecast workspace</h2>
        <p>No plan selected</p>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h2>Forecast workspace</h2>
      <p>Plan: {activeSummary.planId}</p>
      <p>Readiness score: {activeSummary.readinessScore}</p>
      <p>Forecast windows: {activeSummary.forecastWindows}</p>
      <p>Bottlenecks:</p>
      <ul>
        {activeSummary.bottleneck.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
      <h3>Capacity timeline</h3>
      <ol>
        {activeSummary.capacity.slice(0, 5).map((entry) => (
          <li key={entry.actionId}>
            <span>{entry.actionId}</span>
            <span> -&gt; </span>
            <time>{entry.predictedFinish}</time>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onRunPreview(activeSummary.planId)}>
        Preview orchestration
      </button>
    </section>
  );
};
