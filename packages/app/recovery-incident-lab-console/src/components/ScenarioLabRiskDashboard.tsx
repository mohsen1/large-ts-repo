import { type ReactElement, useMemo } from 'react';
import type { IncidentLabScenario, IncidentLabPlan } from '@domain/recovery-incident-lab-core';
import { estimateWindowMinutes } from '@domain/recovery-incident-lab-core';

interface Props {
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
}

interface RiskBucket {
  readonly label: string;
  readonly value: number;
}

const mapRiskBuckets = (scenario: IncidentLabScenario, plan: IncidentLabPlan): readonly RiskBucket[] => {
  const base = Math.max(1, scenario.severity.length);
  const window = estimateWindowMinutes(scenario);
  const queueDensity = plan.queue.length / Math.max(1, scenario.steps.length);

  return [
    { label: 'severity', value: base },
    { label: 'window', value: window },
    { label: 'density', value: Number(queueDensity.toFixed(2)) },
  ];
};

export const ScenarioLabRiskDashboard = ({ scenario, plan }: Props): ReactElement => {
  const risks = useMemo(() => mapRiskBuckets(scenario, plan), [scenario, plan]);

  return (
    <section className="scenario-lab-risk-dashboard">
      <h3>Scenario risk profile</h3>
      <dl>
        {risks.map((risk: RiskBucket) => (
          <div key={risk.label}>
            <dt>{risk.label}</dt>
            <dd>{risk.value}</dd>
          </div>
        ))}
      </dl>
      <p>
        steps: {scenario.steps.length} / labels: {scenario.labels.join(',')}
      </p>
    </section>
  );
};
