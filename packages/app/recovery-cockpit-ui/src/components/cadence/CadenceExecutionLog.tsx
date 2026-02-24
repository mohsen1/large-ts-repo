import { FC } from 'react';
import type { CadenceRunPlan } from '@domain/recovery-operations-cadence';

export type CadenceExecutionLogProps = {
  readonly plans: readonly CadenceRunPlan[];
  readonly candidatesCount: number;
  readonly workspaceLog: readonly string[];
  readonly selectedPlanId: string;
  readonly onPlanSelect: (planId: string) => void;
};

export const CadenceExecutionLog: FC<CadenceExecutionLogProps> = ({
  plans,
  candidatesCount,
  workspaceLog,
  selectedPlanId,
  onPlanSelect,
}) => {
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Cadence execution log</h2>
        <span>candidates: {candidatesCount}</span>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
        <div>
          <strong>Selected plan</strong>
          <p>{selectedPlan ? `${selectedPlan.id} · score ${selectedPlan.readinessScore.toFixed(2)}` : 'none'}</p>
        </div>
        <div>
          <strong>Total windows</strong>
          <p>{selectedPlan?.windows.length ?? 0}</p>
        </div>
      </section>

      <ul style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
        {workspaceLog.length === 0 ? (
          <li>No events yet. Add a run to populate.</li>
        ) : (
          workspaceLog.slice(-200).map((entry, index) => {
            const isPlan = entry.startsWith('plan:');
            const planId = isPlan ? entry.substring(5) : undefined;
            return (
              <li
                key={`${entry}-${index}`}
                style={{
                  border: `1px solid ${isPlan ? '#0ea5e9' : '#e2e8f0'}`,
                  backgroundColor: isPlan ? '#e0f2fe' : '#f8fafc',
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <p style={{ margin: 0 }}>{entry}</p>
                {planId ? (
                  <button type="button" onClick={() => onPlanSelect(planId)} style={{ marginTop: 4 }}>
                    inspect
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
};
