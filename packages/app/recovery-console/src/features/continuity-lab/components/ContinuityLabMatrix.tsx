import type { ContinuityPlan } from '@domain/recovery-continuity-lab-core';

interface ContinuityLabMatrixProps {
  readonly plans: ReadonlyArray<ContinuityPlan>;
}

const colorForScore = (value: number): string => {
  if (value >= 0.8) {
    return '#10b981';
  }
  if (value >= 0.5) {
    return '#f59e0b';
  }
  return '#ef4444';
};

export const ContinuityLabMatrix = ({ plans }: ContinuityLabMatrixProps) => {
  const matrix = plans.map((plan) => ({
    node: `${plan.actions.length}/${plan.signals.length}`,
    value: Math.min(1, (plan.actions.reduce((sum, action) => sum + action.impactScore, 0) / Math.max(1, plan.actions.length)) / 100),
  }));

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '0.7rem', background: '#0b1220' }}>
      <h2 style={{ marginTop: 0 }}>Action impact matrix</h2>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {matrix.map((entry) => (
          <div
            key={entry.node}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              padding: '0.35rem 0.6rem',
              borderRadius: 6,
              border: `1px solid ${colorForScore(entry.value)}`,
            }}
          >
            <span>{entry.node}</span>
            <strong style={{ color: colorForScore(entry.value) }}>{(entry.value * 100).toFixed(0)}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
};
