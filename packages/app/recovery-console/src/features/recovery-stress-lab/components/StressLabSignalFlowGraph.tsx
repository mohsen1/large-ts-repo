import { type ReactElement } from 'react';
import { type ForecastPoint, type ForecastSummary, type Recommendation } from '@domain/recovery-stress-lab-intelligence';

interface SignalFlowGraphProps {
  readonly summary: ForecastSummary | null;
  readonly recommendations: readonly Recommendation[];
  readonly onHoverSignal: (signalId: ForecastPoint['signalId'] | null) => void;
}

interface FlowEdge {
  readonly source: ForecastPoint['signalId'];
  readonly target: ForecastPoint['signalId'];
  readonly confidence: number;
}

const deriveFlow = (points: readonly ForecastPoint[]): readonly FlowEdge[] => {
  const ordered = [...points].toSorted((left, right) => right.forecast - left.forecast);
  const edges: FlowEdge[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (!current || !next) {
      continue;
    }
    edges.push({
      source: current.signalId,
      target: next.signalId,
      confidence: (current.confidence + next.confidence) / 2,
    });
  }

  return edges;
};

const nodeColor = (value: number): string => {
  if (value >= 0.75) return '#ff4d4f';
  if (value >= 0.5) return '#faad14';
  if (value >= 0.25) return '#52c41a';
  return '#1677ff';
};

export const StressLabSignalFlowGraph = ({
  summary,
  recommendations,
  onHoverSignal,
}: SignalFlowGraphProps): ReactElement => {
  const points = summary?.points ?? [];
  const flow = deriveFlow(points);

  const recommendationBySignal = recommendations.reduce<Map<ForecastPoint['signalId'], Recommendation>>(
    (acc, recommendation) => {
      const signal = recommendation.affectedSignals.at(0);
      if (signal) {
        acc.set(signal, recommendation);
      }
      return acc;
    },
    new Map<ForecastPoint['signalId'], Recommendation>(),
  );

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h3>Signal Flow</h3>
      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))`,
          overflowX: 'auto',
        }}
      >
        {points.map((point) => {
          const rec = recommendationBySignal.get(point.signalId);
          const label = rec?.code?.replace('recommendation-', '') ?? point.signalId;
          const severity = rec?.severity ?? 'low';
          return (
            <button
              key={point.signalId}
              type="button"
              onMouseEnter={() => onHoverSignal(point.signalId)}
              onMouseLeave={() => onHoverSignal(null)}
              style={{
                border: `2px solid ${nodeColor(point.forecast)}`,
                borderRadius: 8,
                padding: 10,
                textAlign: 'left',
                color: '#111',
                background: 'white',
                minWidth: 160,
              }}
            >
              <div>Signal {label}</div>
              <div>Forecast {point.forecast.toFixed(3)}</div>
              <div>Conf {point.confidence.toFixed(2)}</div>
              <div>Severity {severity}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {flow.map((edge) => (
          <p key={`${edge.source}-${edge.target}`}>
            {edge.source} -&gt; {edge.target} (confidence {edge.confidence.toFixed(2)})
          </p>
        ))}
      </div>
    </section>
  );
};

export default StressLabSignalFlowGraph;
