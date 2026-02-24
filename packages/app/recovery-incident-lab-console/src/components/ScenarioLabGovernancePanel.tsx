import { type ReactElement, useMemo } from 'react';
import { type OrchestratorOutput } from '@service/recovery-incident-lab-orchestrator';

interface Props {
  readonly output?: OrchestratorOutput;
  readonly title?: string;
}

interface Gauge {
  readonly label: string;
  readonly state: string;
}

const summarize = (output?: OrchestratorOutput): readonly Gauge[] => {
  if (!output) {
    return [
      { label: 'state', state: 'idle' },
      { label: 'signals', state: '0' },
    ];
  }

  return [
    { label: 'state', state: output.run.state },
    { label: 'results', state: String(output.run.results.length) },
    { label: 'plan', state: String(output.plan.queue.length) },
    { label: 'envelopes', state: String(output.telemetry.length) },
  ];
};

export const ScenarioLabGovernancePanel = ({ output, title = 'Governance overview' }: Props): ReactElement => {
  const metrics = useMemo(() => summarize(output), [output]);
  return (
    <section className="scenario-lab-governance-panel">
      <h2>{title}</h2>
      <ul>
        {metrics.map((metric) => (
          <li key={metric.label}>
            <strong>{metric.label}</strong> {metric.state}
          </li>
        ))}
      </ul>
    </section>
  );
};
