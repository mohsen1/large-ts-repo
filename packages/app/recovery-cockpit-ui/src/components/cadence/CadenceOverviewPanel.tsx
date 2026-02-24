import { FC, useMemo } from 'react';
import type { CadenceRunPlan } from '@domain/recovery-operations-cadence';

export type CadenceOverviewPanelProps = {
  plans: readonly CadenceRunPlan[];
  selectedPlanId: string;
  onSelect: (planId: string) => void;
  onExecute: (planId: string) => void;
  onRefresh: () => void;
};

const planBand = (plan: CadenceRunPlan): 'critical' | 'high' | 'normal' | 'stable' => {
  if (plan.readinessScore >= 80) return 'stable';
  if (plan.readinessScore >= 55) return 'normal';
  if (plan.readinessScore >= 30) return 'high';
  return 'critical';
};

const bandColor = {
  stable: '#14532d',
  normal: '#0ea5e9',
  high: '#d97706',
  critical: '#dc2626',
} as const;

export const CadenceOverviewPanel: FC<CadenceOverviewPanelProps> = ({
  plans,
  selectedPlanId,
  onSelect,
  onExecute,
  onRefresh,
}) => {
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const stats = useMemo(
    () => ({
      totalPlans: plans.length,
      totalSlots: plans.reduce((acc, plan) => acc + plan.slots.length, 0),
      totalWindows: plans.reduce((acc, plan) => acc + plan.windows.length, 0),
      avgReadiness: plans.length === 0 ? 0 : plans.reduce((acc, plan) => acc + plan.readinessScore, 0) / plans.length,
    }),
    [plans],
  );

  return (
    <section style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid #cbd5e1', borderRadius: 8 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Recovery Cadence Plans</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onRefresh}>Rebuild list</button>
          <span>{stats.totalPlans} plans</span>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
          <h3>Readiness</h3>
          <p>{stats.avgReadiness.toFixed(2)}</p>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
          <h3>Slots</h3>
          <p>{stats.totalSlots}</p>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
          <h3>Windows</h3>
          <p>{stats.totalWindows}</p>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        {plans.length === 0 ? (
          <p>No cadence plans available. Add run data from workspace controls.</p>
        ) : (
          plans.map((plan) => {
            const band = planBand(plan);
            const selected = plan.id === selectedPlanId;
            return (
              <article
                key={plan.id}
                style={{
                  border: selected ? `2px solid ${bandColor[band]}` : '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: selected ? '#f8fafc' : '#fff',
                }}
              >
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>{plan.id}</h3>
                  <strong style={{ color: bandColor[band] }}>{band}</strong>
                </header>
                <p>Run: {plan.runId}</p>
                <p>Windows: {plan.windows.length}</p>
                <p>Slots: {plan.slots.length}</p>
                <p>Readiness score: {plan.readinessScore}</p>
                <p>Constraint block: {plan.policySummary.blockedByRules.length}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button" onClick={() => onSelect(plan.id)}>Select</button>
                  <button type="button" onClick={() => onExecute(plan.id)} disabled={band === 'critical'}>
                    {band === 'critical' ? 'Needs remediation' : 'Execute'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <aside style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
        <h4>Selected</h4>
        {selectedPlan ? (
          <ul>
            <li>Selected windows: {selectedPlan.windows.map((window) => window.title).join(', ')}</li>
            <li>Created by: {selectedPlan.profile.source}</li>
            <li>Slots: {selectedPlan.slots.length}</li>
            <li>Warnings: {selectedPlan.policySummary.warnings.length}</li>
          </ul>
        ) : (
          <p>None</p>
        )}
      </aside>
    </section>
  );
};
