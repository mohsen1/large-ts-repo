import { FC } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { WorkloadPlan } from '../hooks/useCockpitWorkloadPlanner';

export type CockpitOperationsBoardProps = {
  plans: readonly RecoveryPlan[];
  summaries: ReadonlyArray<WorkloadPlan>;
  active: ReadonlyArray<string>;
  onTogglePlan: (planId: string) => void;
};

export const CockpitOperationsBoard: FC<CockpitOperationsBoardProps> = ({
  plans,
  summaries,
  active,
  onTogglePlan,
}) => {
  const planById = new Map<string, RecoveryPlan>(plans.map((plan) => [plan.planId, plan]));

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, display: 'grid', gap: 12 }}>
      <h2>Orchestration Operations Board</h2>
      <p>Active plans: {active.length}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {summaries.map((summary) => {
          const plan = planById.get(summary.planId);
          const isSelected = active.includes(summary.planId);
          const readinessBar = `${Math.max(0, summary.readinessScore).toFixed(1)}%`;
          const status = summary.ready ? 'green' : 'red';
          return (
            <button
              type="button"
              key={summary.planId}
              onClick={() => onTogglePlan(summary.planId)}
              style={{
                textAlign: 'left',
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 10,
                background: isSelected ? '#f4f8ff' : '#fff',
                color: '#111',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{plan?.labels.short ?? summary.planId}</strong>
                <span style={{ color: status }}>{status}</span>
              </div>
              <div>slots: {summary.slotCount}, windows: {summary.forecastWindows}</div>
              <div>readiness {readinessBar}</div>
              <div>bottlenecks: {summary.bottleneck.length}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
