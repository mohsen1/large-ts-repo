import { useMemo } from 'react';
import { PolicyLabWorkspaceState } from '../hooks/usePolicyLabWorkspace';

interface PolicyLabCommandPanelProps {
  state: PolicyLabWorkspaceState;
}

const scoreFromValue = (value: number): 'low' | 'mid' | 'high' =>
  value > 100 ? 'high' : value > 50 ? 'mid' : 'low';

export const PolicyLabCommandPanel = ({ state }: PolicyLabCommandPanelProps) => {
  const signalRows = useMemo(
    () => state.events.map((event, index) => ({
      id: `${index}-${event}`,
      event,
      score: scoreFromValue(event.length),
    })),
    [state.events],
  );

  return (
    <section>
      <h3>Command Activity</h3>
      <p>Event count: {state.events.length}</p>
      <ul>
        {signalRows.map((row) => (
          <li key={row.id} style={{ color: row.score === 'high' ? 'crimson' : row.score === 'mid' ? 'olive' : 'green' }}>
            {row.event}
          </li>
        ))}
      </ul>
    </section>
  );
};
