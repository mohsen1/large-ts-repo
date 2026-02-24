import { memo, useMemo } from 'react';

export interface SignalMeshPolicyHeatmapProps {
  readonly values: readonly number[];
  readonly labels: readonly string[];
  readonly columns: number;
  readonly onSelectCell?: (index: number, value: number) => void;
}

type HeatCell = {
  readonly column: number;
  readonly row: number;
  readonly value: number;
  readonly index: number;
  readonly label: string;
};

const formatValue = (value: number): string => `${Math.round(value * 100)}%`;

const toGrid = (values: readonly number[], columns: number): readonly HeatCell[] =>
  values.map((value, index) => ({
    index,
    row: Math.floor(index / columns),
    column: index % columns,
    value,
    label: `${index}`,
  }));

export const SignalMeshPolicyHeatmap = memo<SignalMeshPolicyHeatmapProps>(({ values, labels, columns, onSelectCell }) => {
  const cells = useMemo(() => toGrid(values, columns), [values, columns]);
  const palette = useMemo(
    () =>
      cells.map((cell) => {
        const value = Math.max(0, Math.min(1, cell.value));
        const hue = Math.round((1 - value) * 120);
        return `hsl(${hue}, 70%, 60%)`;
      }),
    [cells],
  );

  return (
    <section className="mesh-heatmap">
      <h4>Policy heatmap</h4>
      <div className="mesh-heatmap-grid">
        {cells.map((cell, index) => {
          const color = palette[index] ?? 'hsl(0, 0%, 0%)';
          const row = `${labels[cell.row] ?? ''}:${labels[cell.column] ?? ''}`;
          return (
            <button
              key={`${cell.index}-${cell.value}`}
              type="button"
              title={row}
              style={{ backgroundColor: color }}
              onClick={() => onSelectCell?.(cell.index, cell.value)}
            >
              {formatValue(cell.value)}
            </button>
          );
        })}
      </div>
    </section>
  );
});
