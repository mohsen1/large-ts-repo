import { FC, Fragment, useMemo } from 'react';
import { RecoveryPlan, toTimestamp } from '@domain/recovery-cockpit-models';
import { buildTimeline } from '@service/recovery-cockpit-orchestrator';

export type ScenarioTimelineProps = {
  plan: RecoveryPlan;
};

export const ScenarioTimeline: FC<ScenarioTimelineProps> = ({ plan }) => {
  const timeline = useMemo(() => {
    const windows = plan.actions.map((action) => ({
      at: toTimestamp(new Date()),
      score: 100 - action.expectedDurationMinutes,
      services: [action.serviceCode],
      expectedRecoveryMinutes: action.expectedDurationMinutes,
    }));
    return buildTimeline(plan, windows);
  }, [plan]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Execution timeline</h3>
      <p>Average health: {timeline.summary.toFixed(1)}%</p>
      <ol style={{ display: 'grid', gap: 8 }}>
        {timeline.points.map((point) => (
          <li key={`${point.at}-${point.score}`}>
            <strong>{new Date(point.at).toLocaleTimeString()}</strong>
            {' '}
            <em>{point.score.toFixed(1)}%</em>
            {' '}
            {point.status}
          </li>
        ))}
      </ol>
    </section>
  );
};
