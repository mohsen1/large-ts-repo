import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildReadinessProjection } from '@domain/recovery-cockpit-intelligence';

export type ReadinessForecastGridProps = {
  plan: RecoveryPlan;
};

const bucketKey = (value: number): string => {
  if (value > 80) return 'good';
  if (value > 60) return 'warn';
  return 'critical';
};

export const ReadinessForecastGrid: FC<ReadinessForecastGridProps> = ({ plan }) => {
  const values = useMemo(() => buildReadinessProjection(plan, plan.mode), [plan]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Readiness grid</h3>
      <div style={{ display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr 1fr' }}>
        {values.map((entry: { at: Date; value: number }, index: number) => {
          const bucket = bucketKey(entry.value);
          const color = bucket === 'good' ? '#137333' : bucket === 'warn' ? '#946f00' : '#981d0c';
          return (
            <div
              key={`${entry.at.toISOString()}-${index}`}
              style={{ border: `1px solid ${color}`, borderRadius: 8, padding: 8 }}
            >
              <div style={{ color, fontWeight: 600 }}>{bucket}</div>
              <div>{new Date(entry.at).toLocaleTimeString()}</div>
              <div>{entry.value.toFixed(1)} readiness</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
