import { useMemo } from 'react';
import type { CadenceLabState, CadenceLabSummary } from '../types';

type CadenceRunboardProps = {
  state: CadenceLabState;
};

export const CadenceRunboard = ({ state }: CadenceRunboardProps) => {
  const rows = useMemo(() => Object.entries(state.intents), [state.intents]);

  return (
    <section style={{ border: '1px solid #2d3c53', borderRadius: 12, padding: 12, background: '#0c111b' }}>
      <h3>Active Intent Routing</h3>
      {rows.length === 0 && <p>No intent data available.</p>}
      <div>
        {rows.map(([planId, intents]) => (
          <div key={planId} style={{ marginBottom: 10 }}>
            <h4>{planId}</h4>
            <div style={{ marginLeft: 8 }}>
              {intents.map((intent) => (
                <div key={intent.id} style={{ marginBottom: 4 }}>
                  <strong>{intent.id}</strong> requested by {intent.requestedBy}
                  <div style={{ fontSize: 12, color: '#9fb0cc' }}>{intent.rationale}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
