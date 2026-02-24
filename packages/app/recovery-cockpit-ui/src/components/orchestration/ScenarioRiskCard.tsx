import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildPolicyProfile, enforcePolicy } from '@domain/recovery-cockpit-orchestration-core';

type ScenarioRiskCardProps = {
  readonly plan: RecoveryPlan;
  readonly selected: boolean;
  readonly onToggle: (id: string) => void;
};

const severityBadge = (level: 'green' | 'yellow' | 'red' | 'amber') => {
  if (level === 'green') return { label: 'Low', color: '#047857' };
  if (level === 'yellow') return { label: 'Medium', color: '#b45309' };
  if (level === 'amber') return { label: 'Caution', color: '#d97706' };
  return { label: 'High', color: '#b91c1c' };
};

const constraintSummary = (plan: RecoveryPlan) => {
  const profile = buildPolicyProfile(plan);
  const gate = enforcePolicy(plan);
  const critical = profile.constraints.filter((item) => item.level === 'red').length;
  const amber = profile.constraints.filter((item) => item.level === 'amber' || item.level === 'yellow').length;
  const level: 'green' | 'yellow' | 'amber' | 'red' = gate.allowed
    ? (critical > 0 ? 'amber' : amber > 0 ? 'yellow' : 'green')
    : 'red';
  const badge = severityBadge(level);
  return {
    level,
    score: profile.score,
    risk: profile.riskScore,
    constraints: profile.constraints.length,
    critical,
    amber,
    allowed: gate.allowed,
    recommendations: gate.reasons,
    badge,
  };
};

export const ScenarioRiskCard = ({ plan, selected, onToggle }: ScenarioRiskCardProps) => {
  const summary = constraintSummary(plan);

  return (
    <article
      style={{
        border: selected ? '2px solid #1d4ed8' : '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>{plan.labels.short}</h4>
        <span style={{ color: summary.badge.color, fontWeight: 600 }}>{summary.badge.label}</span>
      </header>
      <p style={{ marginTop: 6, marginBottom: 8 }}>
        policyScore={summary.score.toFixed(1)} risk={summary.risk.toFixed(1)} constraints={summary.constraints}
      </p>
      <p style={{ marginTop: 4, marginBottom: 4 }}>Critical constraints: {summary.critical}</p>
      <p style={{ marginTop: 0, marginBottom: 8 }}>Amber/Warn constraints: {summary.amber}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {summary.recommendations.slice(0, 4).map((recommendation) => (
          <li key={recommendation}>{recommendation}</li>
        ))}
      </ul>
      <button type="button" style={{ marginTop: 10 }} onClick={() => onToggle(plan.planId)}>
        {selected ? 'Unpin scenario' : 'Pin scenario'}
      </button>
    </article>
  );
};
