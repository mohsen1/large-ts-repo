import { useMemo } from 'react';
import type { AdaptiveSimulationOutput } from '../../services/adaptiveSimulationService';

interface SimulationMetricsPanelProps {
  readonly outputs: readonly AdaptiveSimulationOutput[];
}

interface MetricRow {
  readonly key: string;
  readonly values: string[];
}

const buildRows = (outputs: readonly AdaptiveSimulationOutput[]): readonly MetricRow[] => {
  const rows: MetricRow[] = outputs.map((output, index) => {
    const summary = output.result.output.summary;
    return {
      key: `${output.seed}-${index}`,
      values: [
        `health=${summary.health}`,
        `risk=${summary.riskIndex.toFixed(3)}`,
        `signals=${summary.signalCount}`,
        `critical=${summary.criticalCount}`,
      ],
    };
  });

  return rows.toSorted((left, right) => right.key.localeCompare(left.key));
};

export const SimulationMetricsPanel = ({ outputs }: SimulationMetricsPanelProps): React.JSX.Element => {
  const rows = useMemo(() => buildRows(outputs), [outputs]);
  const totalSignals = useMemo(() => rows.reduce((acc, item) => acc + Number(item.values[2]?.split('=')[1] ?? 0), 0), [rows]);
  const totalDiagnostics = useMemo(() => outputs.reduce((acc, item) => acc + item.diagnostics.length, 0), [outputs]);

  return (
    <section style={{ border: '1px solid #0f766e', borderRadius: 12, padding: 12 }}>
      <h3>Adaptive Metrics</h3>
      <p>{`total outputs=${outputs.length}`}</p>
      <p>{`total signals=${totalSignals}`}</p>
      <p>{`total diagnostics=${totalDiagnostics}`}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
        {rows.map((row) => (
          <li
            key={row.key}
            style={{ border: '1px solid #14b8a6', borderRadius: 6, padding: 8, display: 'grid', gap: 2 }}
          >
            <strong>{row.key}</strong>
            <span>{row.values[0]}</span>
            <span>{row.values[1]}</span>
            <span>{row.values[2]}</span>
            <span>{row.values[3]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
