import type { ConstraintState } from '@domain/recovery-scenario-orchestration';
import type { ScenarioEvent } from '../../types/scenario-dashboard/incidentScenarioWorkspace';

export interface ScenarioConstraintPanelProps {
  readonly constraints: readonly {
    readonly id: string;
    readonly key: string;
    readonly state: ConstraintState;
    readonly score: number;
  }[];
  readonly onJump: (eventId: ScenarioEvent['id']) => void;
}

const stateLabel = (state: ConstraintState): string => {
  switch (state) {
    case 'met':
      return 'Met';
    case 'unknown':
      return 'Unknown';
    case 'violated':
    default:
      return 'Violated';
  }
};

export const ScenarioConstraintPanel = ({ constraints, onJump }: ScenarioConstraintPanelProps) => {
  const buckets = constraints.reduce(
    (acc, item) => {
      const list = acc.get(item.state) ?? [];
      list.push(item);
      acc.set(item.state, list);
      return acc;
    },
    new Map<ConstraintState, Array<{ readonly id: string; readonly key: string; readonly score: number }>>(),
  );

  return (
    <section className="scenario-constraints">
      <h3>Constraint Matrix</h3>
      {(['met', 'violated', 'unknown'] as ConstraintState[]).map((state) => {
        const items = buckets.get(state) ?? [];
        return (
          <article key={state}>
            <h4>
              {stateLabel(state)} ({items.length})
            </h4>
            <ul>
              {items.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onJump(`${entry.id}:${state}`)}
                  >
                    {entry.key}
                  </button>
                  <span>{Math.round(entry.score * 100)}%</span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
};
