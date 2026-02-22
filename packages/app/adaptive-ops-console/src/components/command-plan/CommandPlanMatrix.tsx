import { Fragment } from 'react';
import type { PlanDraft } from '@service/recovery-incident-command-orchestrator';

interface CommandPlanMatrixProps {
  draft: PlanDraft | null;
  onRefreshPlan(): void;
}

export const CommandPlanMatrix = ({ draft, onRefreshPlan }: CommandPlanMatrixProps) => {
  const steps = draft?.plan.steps ?? [];

  return (
    <section className="command-plan-matrix">
      <header>
        <h3>Plan matrix</h3>
        <button onClick={onRefreshPlan} disabled={steps.length === 0}>
          Re-evaluate
        </button>
      </header>
      <div className="command-plan-grid">
        <span className="col">Seq</span>
        <span className="col">Command</span>
        <span className="col">Parallel</span>
        <span className="col">Window</span>
        <span className="col">Status</span>
      </div>
      {steps.length === 0 ? <p>No planned steps</p> : null}
      {steps.map((step) => (
        <Fragment key={step.commandId}>
          <div className="command-plan-row">
            <span>{step.sequence}</span>
            <span>{step.commandTitle}</span>
            <span>{step.canRunWithParallelism}</span>
            <span>{new Date(step.scheduledWindow.startsAt).toLocaleTimeString()} - {new Date(step.scheduledWindow.endsAt).toLocaleTimeString()}</span>
            <span>{step.status}</span>
          </div>
          <div className="command-plan-rationale">{step.rationale}</div>
        </Fragment>
      ))}
    </section>
  );
};
