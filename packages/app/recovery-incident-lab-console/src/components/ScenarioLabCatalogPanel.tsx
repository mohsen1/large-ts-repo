import { type ReactElement } from 'react';
import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun } from '@domain/recovery-incident-lab-core';

interface Props {
  readonly title: string;
  readonly scenarios: readonly IncidentLabScenario[];
  readonly plans: readonly IncidentLabPlan[];
  readonly runs: readonly IncidentLabRun[];
}

export const ScenarioLabCatalogPanel = ({ title, scenarios, plans, runs }: Props): ReactElement => {
  const planByScenario = new Map<IncidentLabScenario['id'], readonly IncidentLabPlan[]>();
  for (const plan of plans) {
    const existing = planByScenario.get(plan.scenarioId) ?? [];
    planByScenario.set(plan.scenarioId, [...existing, plan]);
  }

  const runByScenario = new Map<IncidentLabScenario['id'], readonly IncidentLabRun[]>();
  for (const run of runs) {
    const bucket = runByScenario.get(run.scenarioId) ?? [];
    runByScenario.set(run.scenarioId, [...bucket, run]);
  }

  return (
    <section className="scenario-lab-catalog-panel">
      <header>
        <h2>{title}</h2>
        <p>
          scenarios={scenarios.length} plans={plans.length} runs={runs.length}
        </p>
      </header>
      <div>
        {scenarios.map((scenario) => {
          const relatedPlans = planByScenario.get(scenario.id) ?? [];
          const relatedRuns = runByScenario.get(scenario.id) ?? [];
          const lastRun = relatedRuns[0]?.runId ?? 'none';
          const firstStep = scenario.steps[0]?.label ?? 'none';
          return (
            <article key={scenario.id} className="scenario-catalog-item">
              <h3>{scenario.name}</h3>
              <p>{scenario.id}</p>
              <ul>
                <li>severity: {scenario.severity}</li>
                <li>est minutes: {scenario.estimatedRecoveryMinutes}</li>
                <li>steps: {scenario.steps.length} ({firstStep})</li>
                <li>plans: {relatedPlans.length}</li>
                <li>runs: {relatedRuns.length}</li>
                <li>lastRun: {lastRun}</li>
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
};
