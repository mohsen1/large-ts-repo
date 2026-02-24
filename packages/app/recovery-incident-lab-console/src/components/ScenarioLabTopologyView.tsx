import { type ReactElement, useMemo } from 'react';
import { type IncidentLabScenario, type StepId } from '@domain/recovery-incident-lab-core';

interface Props {
  readonly scenario?: IncidentLabScenario;
  readonly selectedSteps?: readonly IncidentLabScenario['steps'][number]['id'][];
}

interface NodeMetric {
  readonly id: StepId;
  readonly label: string;
  readonly severity: number;
}

const nodeMetrics = (scenario?: IncidentLabScenario): readonly NodeMetric[] => {
  if (!scenario) {
    return [];
  }

  return scenario.steps.map((step, index) => ({
    id: step.id,
    label: `${index + 1}.${step.label}`,
    severity: Math.max(1, Math.min(5, 2 + step.expectedDurationMinutes / 4)),
  }));
};

export const ScenarioLabTopologyView = ({ scenario, selectedSteps }: Props): ReactElement => {
  const nodes = useMemo(() => nodeMetrics(scenario), [scenario]);
  const selected = useMemo(() => new Set(selectedSteps ?? []), [selectedSteps]);

  return (
    <section className="scenario-lab-topology-view">
      <h2>Topology preview</h2>
      <p>{scenario ? `${scenario.steps.length} workload steps` : 'no scenario loaded'}</p>
      <ul>
        {nodes.map((node) => (
          <li key={node.id} data-selected={selected.has(node.id) ? 'yes' : 'no'}>
            {node.label} — severity {node.severity}
          </li>
        ))}
      </ul>
    </section>
  );
};
