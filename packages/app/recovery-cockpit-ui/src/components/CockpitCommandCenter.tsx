import { FC } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { ControlEvent } from '@service/recovery-cockpit-orchestrator';
import { PlanId } from '@domain/recovery-cockpit-models';

export type CockpitCommandCenterProps = {
  readonly plans: readonly RecoveryPlan[];
  readonly selectedPlanId: PlanId;
  readonly events: readonly ControlEvent[];
  readonly onSelectPlan: (planId: PlanId) => void;
  readonly onRunPlan: (planId: PlanId) => void;
  readonly onReroutePlan: (planId: PlanId) => void;
};

export const CockpitCommandCenter: FC<CockpitCommandCenterProps> = ({
  plans,
  selectedPlanId,
  events,
  onSelectPlan,
  onRunPlan,
  onReroutePlan,
}) => {
  return (
    <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <h2>Command Center</h2>
      <label htmlFor="command-plan">Plan</label>
        <select id="command-plan" value={selectedPlanId} onChange={(event) => onSelectPlan(event.target.value as PlanId)}>
        {plans.map((plan) => (
          <option key={plan.planId} value={plan.planId}>
            {plan.labels.short} · {plan.labels.emoji}
          </option>
        ))}
      </select>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onRunPlan(selectedPlanId)} disabled={!selectedPlanId}>
          Start command
        </button>
        <button type="button" onClick={() => onReroutePlan(selectedPlanId)} disabled={!selectedPlanId}>
          Reroute
        </button>
      </div>
      <h3 style={{ marginTop: 12 }}>Event log</h3>
      <ul>
        {events.map((event) => (
          <li key={`${event.planId}-${event.runId}-${event.kind}`}>
            {event.kind} {event.planId}
            {' '}
            <small>{event.note}</small>
          </li>
        ))}
      </ul>
    </section>
  );
};
