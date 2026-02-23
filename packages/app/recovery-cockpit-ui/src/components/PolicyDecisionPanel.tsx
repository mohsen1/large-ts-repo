import { FC } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { PolicyEvaluation, evaluatePlanPolicy } from '@service/recovery-cockpit-orchestrator';

export type PolicyDecisionPanelProps = {
  plans: ReadonlyArray<RecoveryPlan>;
};

const status = (evaluation: PolicyEvaluation): 'ok' | 'warn' | 'blocked' => {
  if (evaluation.allowed) {
    return 'ok';
  }
  if (evaluation.violationCount > 1) {
    return 'blocked';
  }
  return 'warn';
};

export const PolicyDecisionPanel: FC<PolicyDecisionPanelProps> = ({ plans }) => {
  const evaluations = plans.map((plan) => ({ plan, evaluation: evaluatePlanPolicy(plan, 'advisory') }));

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Policy decision matrix</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {evaluations.map(({ plan, evaluation }) => {
          const badge = status(evaluation);
          const color = badge === 'ok' ? 'green' : badge === 'warn' ? 'gold' : 'red';
          return (
            <li key={plan.planId} style={{ borderBottom: '1px dashed #ccc', padding: 8 }}>
              <strong>{plan.labels.short}</strong>
              {' '}
              <span style={{ color }}>{badge}</span>
              {' '}
              <span>{evaluation.riskScore}</span>
              <div style={{ color: '#444', fontSize: 12 }}>
                checks={evaluation.checkCount} violations={evaluation.violationCount}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {evaluation.recommendations.slice(0, 2).map((advice) => (
                  <div key={`${plan.planId}-${advice}`}>• {advice}</div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
