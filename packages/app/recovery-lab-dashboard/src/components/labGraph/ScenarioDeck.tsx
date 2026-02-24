import type { FC } from 'react';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';
import { useLabGraphPlanner } from '../../hooks/useLabGraphPlanner';

interface ScenarioDeckProps {
  readonly namespace: string;
  readonly steps: readonly GraphStep<string>[];
}

export const ScenarioDeck: FC<ScenarioDeckProps> = ({ namespace, steps }) => {
  const planner = useLabGraphPlanner({
    namespace,
    steps,
    filter: {
      intensity: 'calm',
    },
  });

  return (
    <section style={{ border: '1px solid #d6e6ff', borderRadius: 10, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Scenario deck</h2>
        <strong>{planner.projectedRuntime.toFixed(0)}ms projected</strong>
      </header>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {Object.entries(planner.phaseGroups).map(([phase, entries]) => (
          <article key={phase} style={{ border: '1px solid #e7edf6', padding: 10 }}>
            <h3 style={{ margin: 0 }}>{phase}</h3>
            <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.plugin}</strong>
                  <span> · est {entry.estimatedMs}ms</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {planner.isEmpty ? <p>No steps to render for namespace {namespace}</p> : null}
      <footer>
        <small>
          intense path:
          {' '}
          {planner.criticalPath.join(', ') || 'none'}
        </small>
      </footer>
    </section>
  );
};
