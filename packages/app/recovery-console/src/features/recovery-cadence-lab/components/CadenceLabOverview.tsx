import { useMemo } from 'react';
import type { CadenceLabSummary, CadenceLabState } from '../types';

type CadenceLabOverviewProps = {
  state: CadenceLabState;
  summaries: readonly CadenceLabSummary[];
};

export const CadenceLabOverview = ({ state, summaries }: CadenceLabOverviewProps) => {
  const statusLabel = useMemo(() => {
    switch (state.status) {
      case 'idle':
        return 'Idle';
      case 'loading':
        return 'Loading';
      case 'ready':
        return 'Ready';
      default:
        return 'Error';
    }
  }, [state.status]);

  return (
    <section style={{ border: '1px solid #334', borderRadius: 12, padding: 12, marginBottom: 12, background: '#10131a' }}>
      <h2 style={{ margin: '0 0 8px 0' }}>Cadence Lab Overview</h2>
      <div style={{ color: '#98a2b3', marginBottom: 8 }}>Status: {statusLabel}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <article style={{ padding: 8, border: '1px solid #20293a', borderRadius: 8 }}>
          <div style={{ color: '#d8e2f0', marginBottom: 6 }}>Active plans</div>
          <strong>{state.plans.length}</strong>
        </article>
        <article style={{ padding: 8, border: '1px solid #20293a', borderRadius: 8 }}>
          <div style={{ color: '#d8e2f0', marginBottom: 6 }}>Selected plan windows</div>
          <strong>{state.selectedWindowCount}</strong>
        </article>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
        {summaries.map((summary) => (
          <li
            key={summary.planId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: '1px solid #1d2433',
            }}
          >
            <span>{summary.displayName}</span>
            <span>{summary.owner}</span>
            <span>{summary.windowCount} windows</span>
            <span>alerts {summary.warningCount}</span>
          </li>
        ))}
      </ul>
      {state.message && <p style={{ marginTop: 8 }}>{state.message}</p>}
    </section>
  );
};
