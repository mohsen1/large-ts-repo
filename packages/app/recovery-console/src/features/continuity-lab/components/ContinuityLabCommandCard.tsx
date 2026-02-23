import type { ContinuityPlan, ContinuityRunResult } from '@domain/recovery-continuity-lab-core';

interface ContinuityLabCommandCardProps {
  readonly plan: ContinuityPlan;
  readonly outcome?: ContinuityRunResult;
}

export const ContinuityLabCommandCard = ({ plan, outcome }: ContinuityLabCommandCardProps) => {
  const outcomeRisk = outcome?.outcomes?.[0]?.risk;
  const outcomeCoverage = outcome?.outcomes?.[0]?.coverage;

  return (
    <article style={{ border: '1px solid #334155', borderRadius: 12, padding: '0.7rem', background: '#0f172a' }}>
      <h3 style={{ marginTop: 0 }}>{plan.title}</h3>
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <p>
          Actions: <strong>{plan.actions.length}</strong>
        </p>
        <p>
          Signals: <strong>{plan.signals.length}</strong>
        </p>
        <p>
          Window confidence: <strong>{(plan.window[0]?.confidence * 100).toFixed(0)}%</strong>
        </p>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.2rem' }}>
        {plan.actions.map((action) => (
          <li key={action.actionId} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{action.title}</span>
            <span style={{ color: action.enabled ? '#34d399' : '#f59e0b' }}>{action.enabled ? 'enabled' : 'disabled'}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: '0.5rem' }}>
        <p style={{ margin: 0 }}>Risk: <strong>{typeof outcomeRisk === 'number' ? outcomeRisk.toFixed(2) : 'n/a'}</strong></p>
        <p style={{ margin: '0.2rem 0' }}>Coverage: <strong>{typeof outcomeCoverage === 'number' ? outcomeCoverage.toFixed(2) : 'n/a'}</strong></p>
      </div>
    </article>
  );
};
