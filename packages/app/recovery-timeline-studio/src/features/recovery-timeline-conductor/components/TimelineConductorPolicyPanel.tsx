import { useMemo } from 'react';
import type { ConductorOutput } from '@domain/recovery-timeline-orchestration';

interface TimelineConductorPolicyPanelProps {
  readonly output: ConductorOutput | undefined;
  readonly pending: number;
}

export function TimelineConductorPolicyPanel({ output, pending }: TimelineConductorPolicyPanelProps) {
  const riskProfile = output?.riskProfile ?? { low: 0, medium: 0, high: 0, critical: 0 };

  const labels = useMemo(() => {
    const values = [riskProfile.low, riskProfile.medium, riskProfile.high, riskProfile.critical];
    const total = values.reduce((acc, value) => acc + value, 0);
    return {
      lowPct: total > 0 ? (riskProfile.low / total) * 100 : 0,
      mediumPct: total > 0 ? (riskProfile.medium / total) * 100 : 0,
      highPct: total > 0 ? (riskProfile.high / total) * 100 : 0,
      criticalPct: total > 0 ? (riskProfile.critical / total) * 100 : 0,
      pending,
    };
  }, [output, pending]);

  return (
    <section>
      <h3>Risk / Policy Snapshot</h3>
      <dl>
        <dt>Low</dt>
        <dd>{labels.lowPct.toFixed(1)}%</dd>
        <dt>Medium</dt>
        <dd>{labels.mediumPct.toFixed(1)}%</dd>
        <dt>High</dt>
        <dd>{labels.highPct.toFixed(1)}%</dd>
        <dt>Critical</dt>
        <dd>{labels.criticalPct.toFixed(1)}%</dd>
        <dt>Pending actions</dt>
        <dd>{labels.pending}</dd>
      </dl>
      {output ? <pre>{JSON.stringify({ id: output.id, timelineId: output.timelineId, mode: output.mode }, null, 2)}</pre> : null}
      <ul>
        {output?.nextSteps.map((step) => <li key={step}>{step}</li>)}
      </ul>
    </section>
  );
}
