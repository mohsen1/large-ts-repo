import type { RecoveryAction, RecoveryScenario } from '@domain/incident-fusion-models';

export interface Props {
  readonly tenant: string;
  readonly scenarios: readonly RecoveryScenario[];
  readonly actions: readonly RecoveryAction[];
}

const actionColor = (action: RecoveryAction): string => {
  if (action.automated) {
    return '#86efac';
  }
  if (action.dependsOn.length > 1) {
    return '#fca5a5';
  }
  return '#93c5fd';
};

export const IncidentFusionScenarioMatrix = ({ tenant, scenarios, actions }: Props) => {
  const byScenario = new Map<string, RecoveryAction[]>();
  for (const action of actions) {
    const bucket = byScenario.get(action.scenarioId) ?? [];
    bucket.push(action);
    byScenario.set(action.scenarioId, bucket);
  }

  return (
    <article style={{ background: '#0c2237', border: '1px solid #244061', borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Scenario matrix · {tenant}</h3>
      <p>{scenarios.length} scenarios, {actions.length} actions</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {scenarios.map((scenario) => {
          const scenarioActions = byScenario.get(scenario.id) ?? [];
          return (
            <section key={scenario.id} style={{ padding: 10, borderRadius: 8, border: '1px solid #2f4762', background: '#102741' }}>
              <h4 style={{ marginTop: 0 }}>{scenario.name}</h4>
              <p>{scenario.state} · risk {scenario.riskScore.toFixed(2)} · confidence {scenario.confidence.toFixed(2)}</p>
              <ul>
                {scenarioActions.map((action) => (
                  <li key={action.id} style={{ color: actionColor(action) }}>
                    {action.title} · {action.estimatedMinutes}m · {action.automated ? 'auto' : 'manual'}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </article>
  );
};
