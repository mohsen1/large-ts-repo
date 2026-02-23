import { useMemo } from 'react';
import type { CommandLabExecutionPlan } from '@domain/incident-command-models';
import type { ReactElement } from 'react';

interface CommandLabPlanCardProps {
  readonly plan: CommandLabExecutionPlan | null;
  readonly onRun?: () => void;
}

export const CommandLabPlanCard = ({ plan, onRun }: CommandLabPlanCardProps): ReactElement => {
  const summary = useMemo(() => {
    if (!plan) {
      return {
        lanes: 0,
        commands: 0,
        estimate: 0,
      };
    }
    const lanes = plan.lanes.length;
    const commands = plan.commands.length;
    const estimate = Math.max(1, plan.estimatedMinutes);
    return { lanes, commands, estimate };
  }, [plan]);

  return (
    <section className="command-lab-plan-card">
      <header>
        <h3>Command Lab Plan</h3>
        <p>{plan ? `Plan ${plan.planId}` : 'No active plan'}</p>
      </header>
      <dl>
        <div>
          <dt>Lanes</dt>
          <dd>{summary.lanes}</dd>
        </div>
        <div>
          <dt>Commands</dt>
          <dd>{summary.commands}</dd>
        </div>
        <div>
          <dt>Estimated minutes</dt>
          <dd>{summary.estimate}</dd>
        </div>
      </dl>
      <button type="button" onClick={onRun} disabled={!plan}>
        Run plan
      </button>
    </section>
  );
};
