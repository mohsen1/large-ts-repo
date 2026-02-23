import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';

export type PolicyRecommendationsProps = {
  plan: RecoveryPlan | undefined;
};

const buildRecommendations = (plan: RecoveryPlan | undefined): string[] => {
  if (!plan) return ['No plan selected'];
  const items: string[] = [];
  if (!plan.isSafe) {
    items.push('Enable dry-run mode for high risk operations.');
  }
  if (plan.actions.some((action) => action.retriesAllowed === 0)) {
    items.push('Attach alternate path for actions without retries.');
  }
  if (plan.mode === 'manual') {
    items.push('Switch to semi-automated mode for reduced toil.');
  }
  if (plan.slaMinutes > 90) {
    items.push('Review dependencies; SLA exceeds threshold.');
  }
  if (items.length === 0) {
    items.push('Current policy posture is healthy.');
  }
  return items;
};

export const PolicyRecommendations: FC<PolicyRecommendationsProps> = ({ plan }) => {
  const recommendations = useMemo(() => buildRecommendations(plan), [plan]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Policy recommendations</h3>
      <ul>
        {recommendations.map((advice, index) => (
          <li key={`${advice}-${index}`}>{advice}</li>
        ))}
      </ul>
      <small>Recommendations are generated from policy policy rules and historical readiness telemetry.</small>
    </section>
  );
};
