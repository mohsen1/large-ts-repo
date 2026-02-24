import { memo } from 'react';
import type { ConvergencePlan, ConvergenceWorkspace } from '@domain/recovery-ops-orchestration-lab';

interface ConvergenceWorkspaceSummaryProps {
  readonly workspace: ConvergenceWorkspace;
  readonly onRefresh: () => void;
  readonly isBusy: boolean;
}

const formatSignal = (plan: ConvergencePlan): string => {
  const signalCount = plan.steps.reduce((acc, step) => acc + step.dependencies.length, 0);
  return `${plan.id.slice(0, 12)}::${plan.title}`.replace(/\s+/g, ' ') + ` (+${signalCount} deps)`;
};

const topPlanName = (plans: readonly ConvergencePlan[]): string => {
  if (plans.length === 0) {
    return 'No plans';
  }
  return formatSignal(plans[0]);
};

const averageScore = (plans: readonly ConvergencePlan[]): number => {
  if (plans.length === 0) {
    return 0;
  }
  return plans.reduce((acc, plan) => acc + plan.score, 0) / plans.length;
};

export const ConvergenceWorkspaceSummary = memo<ConvergenceWorkspaceSummaryProps>(({ workspace, onRefresh, isBusy }) => {
  const topPlan = topPlanName(workspace.plans);
  const avg = averageScore(workspace.plans);
  const risk = avg > 75 ? 'low' : avg > 40 ? 'medium' : 'high';
  const signalCount = workspace.signals.length;

  return (
    <section style={{ display: 'grid', gap: 12, padding: 16, border: '1px solid #2d3748', borderRadius: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Convergence Workspace</h2>
        <button onClick={onRefresh} disabled={isBusy} type="button">
          Refresh
        </button>
      </header>
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: 0, gap: 8 }}>
        <div>
          <dt>Workspace</dt>
          <dd>{workspace.id}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>{workspace.domain}</dd>
        </div>
        <div>
          <dt>Signals</dt>
          <dd>{signalCount}</dd>
        </div>
        <div>
          <dt>Avg Score</dt>
          <dd>{avg.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Top Plan</dt>
          <dd>{topPlan}</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{risk}</dd>
        </div>
      </dl>
    </section>
  );
});

ConvergenceWorkspaceSummary.displayName = 'ConvergenceWorkspaceSummary';
