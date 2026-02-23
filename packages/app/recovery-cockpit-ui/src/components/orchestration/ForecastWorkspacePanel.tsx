import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { HeatLevel } from '@data/recovery-cockpit-store';

type SimulationRow = {
  readonly planId: string;
  readonly score: number;
  readonly heat: HeatLevel;
};

export type ForecastWorkspacePanelProps = {
  readonly plan: RecoveryPlan | undefined;
  readonly rows: readonly SimulationRow[];
  readonly onChangeMode: (mode: 'forecast' | 'preview' | 'simulate') => void;
};

const modeColor = (heat: SimulationRow['heat']) => {
  if (heat === 'green') return '#06b6d4';
  if (heat === 'amber') return '#d97706';
  return '#dc2626';
};

export const ForecastWorkspacePanel: FC<ForecastWorkspacePanelProps> = ({ plan, rows, onChangeMode }) => {
  const metrics = useMemo(
    () =>
      rows
        .map((entry) => entry.score * 1.1)
        .reduce((acc, value) => acc + value, 0) / Math.max(1, rows.length),
    [rows],
  );

  return (
    <section style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: 12 }}>
      <h3>Forecast workspace</h3>
      {plan ? (
        <div>
          <p>Forecasting: {plan.labels.short}</p>
          <p>Composite score: {metrics.toFixed(2)}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button type="button" onClick={() => onChangeMode('forecast')}>
              Forecast
            </button>
            <button type="button" onClick={() => onChangeMode('preview')} style={{ marginLeft: 6 }}>
              Preview
            </button>
            <button type="button" onClick={() => onChangeMode('simulate')} style={{ marginLeft: 6 }}>
              Simulate
            </button>
          </div>
        </div>
      ) : (
        <p>No plan selected</p>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.length === 0 ? <p>No rows</p> : null}
        {rows.map((row) => (
          <div
            key={row.planId}
            style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e5e7eb', paddingTop: 6 }}
          >
            <span>{row.planId}</span>
            <span style={{ color: modeColor(row.heat) }}>
              {row.heat} · {row.score.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
