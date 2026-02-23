import { FC } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitInsightsStore } from '@data/recovery-cockpit-insights';

export type PolicyCoverageCardProps = {
  plan: RecoveryPlan;
  insights: InMemoryCockpitInsightsStore;
};

export const PolicyCoverageCard: FC<PolicyCoverageCardProps> = ({ plan, insights }) => {
  const signalCount = insights.countSignals(plan.planId);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Policy coverage</h3>
      <p>Target plan: {plan.labels.short}</p>
      <p>Signal coverage: {signalCount}</p>
      <p>Status: {signalCount > 0 ? 'signals captured' : 'no signals yet'}</p>
    </section>
  );
};
