import { useMemo } from 'react';
import type { SituationalAssessment } from '@domain/recovery-situational-intelligence';

export const SituationalTimeline = ({
  assessments,
}: {
  readonly assessments: readonly SituationalAssessment[];
}) => {
  const series = useMemo(() => {
    const ordered = [...assessments].sort((left, right) => left.assessmentId.localeCompare(right.assessmentId));
    return ordered.map((assessment, index) => ({
      id: assessment.assessmentId,
      label: `${assessment.workload.name} #${index + 1}`,
      event: `${assessment.phase}:${assessment.status}`,
      confidence: Math.round(assessment.weightedConfidence * 100),
      commandCount: assessment.commands.length,
      started: assessment.commands.at(0)?.startedAt ?? assessment.assessmentId,
    }));
  }, [assessments]);

  return (
    <section className="situational-timeline">
      <h2>Timeline</h2>
      <ul>
        {series.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            <span> {item.event}</span>
            <span> confidence={item.confidence}%</span>
            <span> commands={item.commandCount}</span>
            <span> started={item.started}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
