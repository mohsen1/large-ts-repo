import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildReadinessProjection } from '@domain/recovery-cockpit-intelligence';
import { simulatePlan } from '@service/recovery-cockpit-orchestrator';

export type RunMonitorPanelProps = {
  plan: RecoveryPlan;
};

export const RunMonitorPanel: FC<RunMonitorPanelProps> = ({ plan }) => {
  const simulation = useMemo(() => simulatePlan(plan), [plan]);
  const projection = useMemo(() => buildReadinessProjection(plan, plan.mode), [plan]);

  const score = useMemo(() => {
    if (projection.length === 0) {
      return 0;
    }

    const total = projection.reduce((sum: number, current: { value: number }) => sum + current.value, 0);
    return Number((total / projection.length).toFixed(1));
  }, [projection]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Run monitor</h3>
      <table>
        <tbody>
          <tr>
            <td>Estimated minutes</td>
            <td>{simulation.estimatedMinutes}</td>
          </tr>
          <tr>
            <td>Readiness mean</td>
            <td>{score}</td>
          </tr>
          <tr>
            <td>Warnings</td>
            <td>{simulation.criticalWarnings.length}</td>
          </tr>
        </tbody>
      </table>
      <ul>
        {simulation.steps.map((step) => (
          <li key={step.actionId}>
            {step.actionId} · {step.status} · {step.expectedDurationMinutes}m
          </li>
        ))}
      </ul>
    </section>
  );
};
