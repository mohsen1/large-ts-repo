import { useMemo } from 'react';
import type { AdaptiveSimulationOutput } from '../../services/adaptiveSimulationService';

interface SimulationTopologyPanelProps {
  readonly outputs: readonly AdaptiveSimulationOutput[];
}

interface TopologySummary {
  readonly label: string;
  readonly count: number;
  readonly score: number;
}

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export const SimulationTopologyPanel = ({ outputs }: SimulationTopologyPanelProps): React.JSX.Element => {
  const summary = useMemo<readonly TopologySummary[]>(() => {
    const buckets = new Map<string, number[]>();
    for (const output of outputs) {
      const topology = output.fingerprint.split(':')[1] ?? 'grid';
      const score = output.result.output.summary.riskIndex ?? 0;
      const bucket = buckets.get(topology) ?? [];
      bucket.push(score);
      buckets.set(topology, bucket);
    }

    return [...buckets.entries()].map(([label, items]) => ({
      label,
      count: items.length,
      score: average(items),
    }));
  }, [outputs]);

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
      <h3>Topology Summary</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {summary.length > 0 ? summary.map((entry) => (
          <article
            key={`${entry.label}-${entry.count}`}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}
          >
            <h4>{entry.label}</h4>
            <p>{`runs: ${entry.count}`}</p>
            <p>{`avg risk: ${entry.score.toFixed(3)}`}</p>
          </article>
        )) : <p>No topology data yet</p>}
      </div>
    </section>
  );
};
