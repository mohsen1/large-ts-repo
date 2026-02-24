import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { useAdvancedCockpitOrchestration } from '../../hooks/useAdvancedCockpitOrchestration';

interface PolicyPoint {
  readonly phase: string;
  readonly accepted: boolean;
  readonly score: number;
}

interface OrchestrationPolicyMatrixProps {
  readonly plans: readonly RecoveryPlan[];
}

const buildMatrix = (plans: readonly RecoveryPlan[]): PolicyPoint[] => {
  return plans.flatMap((plan) => {
    const count = plan.actions.length;
    const baseline = Math.max(10, 90 - count * 6);
    return [
      { phase: 'intake', accepted: baseline > 40, score: baseline },
      { phase: 'validate', accepted: plan.actions.every((action) => action.expectedDurationMinutes > 0), score: baseline - 5 },
      { phase: 'plan', accepted: count > 0, score: baseline + 3 },
      { phase: 'execute', accepted: count < 12, score: baseline + 8 },
      { phase: 'verify', accepted: baseline > 20, score: baseline + 12 },
      { phase: 'finalize', accepted: baseline > 0, score: baseline + 15 },
    ];
  });
};

const statusDot = (accepted: boolean): string => (accepted ? '🟢' : '🟠');

export const OrchestrationPolicyMatrix: FC<OrchestrationPolicyMatrixProps> = ({ plans }) => {
  const rows = useMemo(() => buildMatrix(plans), [plans]);

  const grouped = rows.reduce<Record<string, PolicyPoint[]>>((acc, row) => {
    const bucket = acc[row.phase] ?? [];
    bucket.push(row);
    acc[row.phase] = bucket;
    return acc;
  }, {});

  const metrics = useAdvancedCockpitOrchestration({
    workspaceId: 'recovery-cockpit-advanced',
    plans: plans,
    autoStart: false,
  });

  return (
    <section style={{ border: '1px solid #d4d4d8', borderRadius: 12, padding: 16, background: '#fafafa' }}>
      <h3 style={{ margin: '0 0 12px' }}>Policy matrix</h3>
      <p style={{ marginTop: 0, color: '#475569', fontSize: 12 }}>
        snapshots: {metrics.health} / plugins: {metrics.seededPlugins.count}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(130px, 1fr))', gap: 12 }}>
        {Object.entries(grouped).map(([phase, values]) => {
          const scoreSum = values.reduce((acc, item) => acc + item.score, 0);
          const acceptanceRate =
            values.length > 0
              ? values.filter((entry) => entry.accepted).length / values.length
              : 0;

          return (
            <article
              key={phase}
              style={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: 8,
                background: acceptanceRate > 0.66 ? '#ecfccb' : acceptanceRate > 0.33 ? '#fef9c3' : '#fee2e2',
              }}
            >
              <h4 style={{ margin: '0 0 8px', textTransform: 'uppercase', fontSize: 12 }}>{phase}</h4>
              <p style={{ margin: 0, fontSize: 12, color: '#334155' }}>
                score={scoreSum.toFixed(1)} | pass={Math.round(acceptanceRate * 100)}%
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginTop: 8 }}>
                {values.map((entry, index) => (
                  <li key={`${entry.phase}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span>
                      {statusDot(entry.accepted)} {entry.phase}-{index}
                    </span>
                    <strong>{entry.score}</strong>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
};
