import { useMemo } from 'react';
import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

interface FaultIntelTimelineProps {
  readonly run?: CampaignRunResult;
}

export const FaultIntelTimeline = ({ run }: FaultIntelTimelineProps) => {
  const steps = useMemo(
    () =>
      run
        ? [
            {
              title: 'Campaign created',
              time: run.executedAt,
              score: `${run.riskScore.toFixed(2)} risk`,
            },
            {
              title: `Policy ${run.policy.name}`,
              time: run.executedAt,
              score: `${run.signals.length} signals`,
            },
            {
              title: 'Execution finalized',
              time: run.executedAt,
              score: `${run.policy.requiredStages.join(' -> ')}`,
            },
          ]
        : [
            {
              title: 'No run yet',
              time: new Date().toISOString(),
              score: 'Awaiting execution',
            },
          ],
    [run],
  );

  return (
    <section style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 8px' }}>Execution timeline</h3>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
        {steps.map((step) => (
          <li key={`${step.title}-${step.time}`} style={{ lineHeight: 1.5 }}>
            <strong>{step.title}</strong>
            <p style={{ margin: '4px 0' }}>{step.time}</p>
            <small style={{ color: '#64748b' }}>{step.score}</small>
          </li>
        ))}
      </ol>
    </section>
  );
};
