import { FC, useMemo, useState } from 'react';
import { useCockpitControlLoop } from '../hooks/useCockpitControlLoop';
import { CommandCenterDashboard } from '../components/CommandCenterDashboard';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';

export const RecoveryCockpitControlCenterPage: FC = () => {
  const [focus, setFocus] = useState('');
  const control = useCockpitControlLoop({
    parallelism: 3,
    maxRuntimeMinutes: 210,
    policyMode: 'advisory',
    retryPolicy: { enabled: true, maxRetries: 2 },
  });

  const plansByHealth = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const plan of control.plans) {
      const band = bandForPlan(plan);
      buckets.set(band, (buckets.get(band) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([band, count]) => ({ band, count }));
  }, [control.plans]);

  return (
    <section style={{ padding: 20, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h1>Recovery Cockpit Control Center</h1>
        <button type="button" onClick={() => void control.bootstrap()}>Bootstrap</button>
        <button type="button" onClick={() => void control.refresh()}>Refresh</button>
      </header>

      <aside style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Ready: {control.ready ? 'yes' : 'no'}</span>
        <span>Plans: {control.plans.length}</span>
        <span>Runs: {control.runs.length}</span>
        <span>Director: {control.directorPlans.length}</span>
        <span>Focus: {focus || 'none'}</span>
        {plansByHealth.length === 0 ? null : (
          <span>
            Health bands: {plansByHealth.map((entry) => `${entry.band}:${entry.count}`).join(' | ')}
          </span>
        )}
      </aside>

      <section>
        <label htmlFor="focus-plan">Focus plan</label>
        <select
          id="focus-plan"
          value={focus}
          onChange={(event) => {
            const value = event.target.value;
            setFocus(value);
            control.setSelectedPlanId(value);
          }}
        >
          <option value="">All</option>
          {control.plans.map((plan) => (
            <option key={plan.planId} value={plan.planId}>
              {plan.labels.short}
            </option>
          ))}
        </select>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3>Control log</h3>
        <ul>
          {control.controlLog.slice(-8).map((entry, index) => (
            <li key={`${entry.planId}-${entry.action}-${index}`}>
              <strong>{entry.action}</strong> {entry.planId} · {entry.at}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <CommandCenterDashboard
          plans={control.plans}
          selectedPlanId={focus || (control.plans[0]?.planId ?? '')}
          decisions={control.decisions}
          directors={control.directorPlans}
          readinessWindows={control.readinessWindows}
          onStart={control.runPlan}
          onPause={control.pausePlan}
          onRefresh={() => void control.refresh()}
          insightCount={control.insightsCount}
        />
      </section>
    </section>
  );
};

const bandForPlan = (plan: RecoveryPlan): 'low' | 'medium' | 'high' | 'critical' => {
  const risk = plan.slaMinutes;
  if (risk >= 90) return 'low';
  if (risk >= 60) return 'medium';
  if (risk >= 30) return 'high';
  return 'critical';
};
