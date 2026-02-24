import { useMemo } from 'react';
import { PolicyLabWorkspaceState } from '../hooks/usePolicyLabWorkspace';

interface PolicyLabRunDeckProps {
  state: PolicyLabWorkspaceState;
  onSelectTemplate: (templateId: string) => void;
}

const formatMetric = (value: number): string => `${value.toFixed(1)}ms`;

export const PolicyLabRunDeck = ({ state, onSelectTemplate }: PolicyLabRunDeckProps) => {
  const deck = useMemo(
    () =>
      state.metrics.map((metric) => ({
        ...metric,
        selected: state.selectedTemplates.includes(metric.id),
      })),
    [state.metrics, state.selectedTemplates],
  );

  return (
    <section>
      <h3>Run Deck</h3>
      {deck.length === 0 ? (
        <p>No metrics available for this workspace.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {deck.map((metric) => (
            <button
              key={metric.id}
              type="button"
              onClick={() => onSelectTemplate(metric.id)}
              style={{ textAlign: 'left', color: metric.selected ? 'white' : undefined, backgroundColor: metric.selected ? 'darkslateblue' : undefined }}
            >
              {metric.title}: {formatMetric(metric.value)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
