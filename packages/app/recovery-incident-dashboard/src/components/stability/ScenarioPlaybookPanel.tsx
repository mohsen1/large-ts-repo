import type { StabilityAdvice } from '@service/recovery-stability-orchestrator';

export interface ScenarioPlaybookPanelProps {
  readonly advice?: StabilityAdvice;
}

export const ScenarioPlaybookPanel = ({ advice }: ScenarioPlaybookPanelProps) => {
  if (!advice) {
    return <p>No advisory loaded.</p>;
  }

  return (
    <section>
      <h3>Stability advisory</h3>
      <p>{advice.reasonSummary}</p>
      <ul>
        {advice.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
      <p>Risk score: {advice.envelope.riskScore}</p>
      <p>Grade: {advice.envelope.stabilityGrade}</p>
      <p>Hard stop: {advice.envelope.hardStop ? 'yes' : 'no'}</p>
    </section>
  );
};
