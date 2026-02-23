import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { evaluatePlanSla, summarizeConstraintHealth, estimateSlaWindow } from '@domain/recovery-cockpit-models';

export type SloGaugeProps = {
  readonly plans: readonly RecoveryPlan[];
  readonly selectedPlanId?: string;
};

const levelColor = (score: number) => (score > 80 ? '#16a34a' : score > 60 ? '#f59e0b' : '#dc2626');

export const SloGauge: FC<SloGaugeProps> = ({ plans, selectedPlanId }) => {
  const windows = useMemo(() => {
    const selected = selectedPlanId ? plans.find((plan) => plan.planId === selectedPlanId) : undefined;
    if (!selected) return [] as string[];
    const evalResult = evaluatePlanSla(selected);
    const summary = summarizeConstraintHealth(selected);
    const range = estimateSlaWindow(selected);
    return [`${summary} score=${evalResult.overallScore}`, `sla=${range.startsAt}..${range.endsAt}`, `status=${evalResult.status}`];
  }, [plans, selectedPlanId]);

  return (
    <section style={{ border: '1px solid #0f766e', borderRadius: 12, padding: 12 }}>
      <h3>SLO gauge</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {windows.length === 0 ? <p>No plan selected</p> : null}
        {windows.map((line) => {
          const value = Number(line.split('score=')[1] ?? 0);
          return (
            <div key={line} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{line}</span>
              <span style={{ color: levelColor(Number.isNaN(value) ? 0 : value), fontWeight: 700 }}>
                {(Number.isNaN(value) ? 0 : value).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
