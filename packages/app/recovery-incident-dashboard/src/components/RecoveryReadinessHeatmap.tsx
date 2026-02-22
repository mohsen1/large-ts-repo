import { useMemo } from 'react';
import type { SituationalAssessment } from '@domain/recovery-situational-intelligence';

const bucket = (value: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (value >= 0.8) {
    return 'critical';
  }
  if (value >= 0.55) {
    return 'high';
  }
  if (value >= 0.3) {
    return 'medium';
  }
  return 'low';
};

const block = (assessment: SituationalAssessment) => {
  const { weightedConfidence: confidence } = assessment;
  return {
    id: assessment.assessmentId,
    nodeName: assessment.workload.name,
    bucket: bucket(1 - confidence),
    signalDensity: Math.min(100, assessment.signalCount * 9),
  };
};

export const RecoveryReadinessHeatmap = ({
  assessments,
  onCellSelect,
}: {
  readonly assessments: readonly SituationalAssessment[];
  readonly onCellSelect: (assessmentId: string) => void;
}) => {
  const cells = useMemo(() => assessments.map(block), [assessments]);

  return (
    <section className="readiness-heatmap">
      <h2>Readiness Heatmap</h2>
      <div className="heatmap-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '10px' }}>
        {cells.map((cell) => (
          <article
            key={cell.id}
            className={`heatmap-cell bucket-${cell.bucket}`}
            onClick={() => onCellSelect(cell.id)}
          >
            <h4>{cell.nodeName}</h4>
            <p>Status: {cell.bucket}</p>
            <p>Signals: {cell.signalDensity}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
