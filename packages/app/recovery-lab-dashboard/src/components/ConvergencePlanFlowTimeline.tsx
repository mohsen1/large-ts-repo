import { useMemo } from 'react';
import type { ConvergenceSummary } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';

type TimelinePoint = {
  readonly stage: string;
  readonly index: number;
  readonly label: string;
};

interface ConvergencePlanFlowTimelineProps {
  readonly summary: ConvergenceSummary;
}

export const ConvergencePlanFlowTimeline = ({ summary }: ConvergencePlanFlowTimelineProps) => {
  const points = useMemo<readonly TimelinePoint[]>(() => {
    return summary.stageTrail.map((stage, index) => ({
      stage: stage,
      index,
      label: `${index + 1}: ${stage}`,
    }));
  }, [summary.stageTrail]);

  if (points.length === 0) {
    return <p>no stage trail</p>;
  }

  const first = points[0] ?? null;

  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {first ? <li style={{ fontWeight: 700, marginBottom: 8 }}>start: {first.label}</li> : null}
      {points.slice(1).map((point) => (
        <li key={`${point.stage}-${point.index}`} style={{ marginBottom: 6 }}>
          {point.label}
        </li>
      ))}
    </ol>
  );
};
