import type { SurfaceAnalysis } from '@service/recovery-drill-surface-orchestrator';

interface Props {
  readonly analysis: SurfaceAnalysis;
  readonly index: number;
  readonly onSelect: (runId: string) => void;
}

const riskColor = (risk: number): 'green' | 'yellow' | 'red' => {
  if (risk >= 60) {
    return 'red';
  }
  if (risk >= 30) {
    return 'yellow';
  }
  return 'green';
};

const formatMetric = (value: number): string => `${Math.round(value * 10) / 10}`;

export const SurfaceRunCard = ({ analysis, index, onSelect }: Props) => {
  return (
    <article style={{ border: `2px solid ${riskColor(analysis.risk)}`, padding: 12, borderRadius: 8, background: '#f8f9fb', marginBottom: 12 }}>
      <header>
        <h3>
          #{index} {analysis.runId}
        </h3>
        <p>
          score={analysis.score} risk={analysis.risk} progress={analysis.progress}% velocity={analysis.velocity}
        </p>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {analysis.metrics.map((metric) => (
          <div key={`${analysis.runId}-${metric.label}`} style={{ padding: 8, borderRadius: 6, background: '#fff', border: '1px solid #dbe3ef' }}>
            <strong>{metric.label}</strong>
            <div>
              {formatMetric(metric.value)}
            </div>
            <small>weight {metric.weight}</small>
          </div>
        ))}
      </section>
      <p>blockers {analysis.blockers.join(', ') || 'none'}</p>
      <button type="button" onClick={() => onSelect(analysis.runId)}>
        Inspect run
      </button>
    </article>
  );
};
