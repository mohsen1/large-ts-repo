import { FC } from 'react';
import { ReadinessNarrative } from '../hooks/useReadinessNarrative';
import { PlanId } from '@domain/recovery-cockpit-models';

export type ReadinessNarrativePanelProps = {
  readonly narratives: readonly ReadinessNarrative[];
  readonly selectedPlanId: PlanId;
};

export const ReadinessNarrativePanel: FC<ReadinessNarrativePanelProps> = ({ narratives, selectedPlanId }) => {
  const active = narratives.find((narrative) => narrative.planId === selectedPlanId);
  return (
    <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <h2>Readiness Narrative</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {active ? (
          <>
            <p>
              <strong>{active.planId}</strong>
            </p>
            <p>Trend: {active.trend}</p>
            <p>Score: {active.score.toFixed(2)}</p>
            <p>Risk band: {active.risk}</p>
            <p>
              Signal bands:
              {' '}
              green={active.readinessWindow.green}
              {' '}
              yellow={active.readinessWindow.yellow}
              {' '}
              red={active.readinessWindow.red}
            </p>
          </>
        ) : (
          <p>Select a plan for narrative</p>
        )}
      </div>
    </section>
  );
};
