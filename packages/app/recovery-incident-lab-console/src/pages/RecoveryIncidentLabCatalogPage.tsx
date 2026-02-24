import { type ReactElement } from 'react';
import { useRecoveryLabCatalog } from '../hooks/useRecoveryLabCatalog';
import { ScenarioLabCatalogPanel } from '../components/ScenarioLabCatalogPanel';
import { ScenarioLabRiskMatrixView } from '../components/ScenarioLabRiskMatrixView';
import { buildLabTopology, type PlanRiskScore, type IncidentLabPlan, draftPlan } from '@domain/recovery-incident-lab-core';
import { computePlanRisk } from '@domain/recovery-incident-lab-core';

export const RecoveryIncidentLabCatalogPage = (): ReactElement => {
  const { state, pressure } = useRecoveryLabCatalog();
  const risks: readonly PlanRiskScore[] = state.scenarios.map((scenario) =>
    computePlanRisk(
      scenario,
      [],
      draftPlan({
        scenario,
        orderedBy: 'topology',
        requestedBy: 'catalog-page',
      }).plan as IncidentLabPlan,
    ),
  );

  const heat = pressure.map((entry) => `${entry.scenarioId}:${entry.score}`).join('\n');
  return (
    <main className="recovery-incident-lab-catalog-page">
      <header>
        <h1>Recovery Incident Lab Catalog</h1>
      </header>
      <ScenarioLabRiskMatrixView title="Catalog risk matrix" risks={risks} />
      <pre>{heat}</pre>
      <ScenarioLabCatalogPanel
        title="Scenario catalog"
        scenarios={state.scenarios}
        plans={state.plans}
        runs={state.runs}
      />
      <section>
        <h2>Topology health</h2>
        <ul>
          {state.scenarios.map((scenario) => {
            const topology = buildLabTopology(scenario.steps);
            return (
              <li key={scenario.id}>
                {scenario.name}: {topology.nodes.length} nodes / {topology.links.length} links
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
};
