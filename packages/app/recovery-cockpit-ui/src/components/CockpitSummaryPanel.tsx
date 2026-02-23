import { FC, ReactNode } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';

export type CockpitSummaryPanelProps = {
  plan: RecoveryPlan;
  onStartPlan: () => void;
  actionCountLabel: (count: number) => ReactNode;
};

const RiskChip = ({ level }: { level: 'low' | 'medium' | 'high' }) => {
  const color = level === 'low' ? 'green' : level === 'medium' ? 'orange' : 'red';
  return <span style={{ backgroundColor: color, color: '#fff', padding: '2px 8px', borderRadius: 12 }}>{level}</span>;
};

export const CockpitSummaryPanel: FC<CockpitSummaryPanelProps> = ({ plan, onStartPlan, actionCountLabel }) => {
  const risk = plan.isSafe ? 'low' : plan.slaMinutes > 90 ? 'high' : 'medium';
  const safetyScore = plan.slaMinutes <= 60 ? 100 : plan.slaMinutes <= 120 ? 70 : 45;

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{plan.labels.short} {plan.labels.emoji}</h2>
        <RiskChip level={risk} />
      </header>
      <p>{plan.title}</p>
      <p>{plan.description}</p>
      <div style={{ marginTop: 8 }}>
        <strong>Mode:</strong> {plan.mode}<br />
        <strong>SLA:</strong> {plan.slaMinutes} min<br />
        <strong>Safety score:</strong> {safetyScore}<br />
        <strong>Actions:</strong> {actionCountLabel(plan.actions.length)}
      </div>
      <button type="button" onClick={onStartPlan} disabled={!plan.actions.length}>
        Run recovery sequence
      </button>
    </section>
  );
};
