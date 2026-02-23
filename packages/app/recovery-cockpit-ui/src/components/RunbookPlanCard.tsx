import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { summarizeStrategy } from '@service/recovery-cockpit-orchestrator';
import { buildExecutionStrategy } from '@service/recovery-cockpit-orchestrator';

export type RunbookPlanCardProps = {
  readonly plan: RecoveryPlan;
  readonly strategy: 'fastest-first' | 'critical-first' | 'dependency-first' | 'balanced';
  readonly onOpen: () => void;
  readonly onRunPreview: () => void;
};

export const RunbookPlanCard: FC<RunbookPlanCardProps> = ({ plan, strategy, onOpen, onRunPreview }) => {
  const summary = useMemo(() => {
    const strategyPlan = buildExecutionStrategy(plan, strategy);
    return summarizeStrategy(plan, strategyPlan);
  }, [plan, strategy]);

  const hasCritical = plan.actions.some((action) => action.expectedDurationMinutes > 30);
  const safeActions = plan.actions.filter((action) => !action.command.includes('delete'));

  return (
    <article style={{ border: '1px solid #ced2de', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
      <header>
        <h2 style={{ margin: 0 }}>{plan.labels.emoji} {plan.labels.short}</h2>
        <p style={{ margin: '4px 0' }}>{plan.labels.long}</p>
      </header>
      <p>Mode: <strong>{plan.mode}</strong> | Actions: {plan.actions.length}</p>
      <p>Readiness score trend: {plan.slaMinutes}%</p>
      <p>Policy preview: {summary}</p>
      <p>Safe actions: {safeActions.length} / {plan.actions.length}</p>
      <p>Critical windows: {hasCritical ? 'yes' : 'no'}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onOpen}>Open plan</button>
        <button type="button" onClick={onRunPreview}>Preview orchestration</button>
      </div>
    </article>
  );
};
