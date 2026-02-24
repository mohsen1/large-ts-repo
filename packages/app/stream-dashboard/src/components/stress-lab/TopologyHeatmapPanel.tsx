import { useMemo } from 'react';
import { type StreamLabExecutionResult } from '../../stress-lab/types';
import { type StreamLabExecutionTrace } from '../../stress-lab/types';

type TopologyCell = {
  readonly row: number;
  readonly col: number;
  readonly plugin: StreamLabExecutionTrace['pluginName'];
  readonly duration: number;
};

export interface TopologyHeatmapPanelProps {
  readonly result: StreamLabExecutionResult;
  readonly onCellSelect: (cell: TopologyCell) => void;
}

const toCellGrid = (traces: readonly StreamLabExecutionTrace[]): readonly TopologyCell[] => {
  return traces.flatMap((trace, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    return [{
      row,
      col,
      plugin: trace.pluginName,
      duration: trace.elapsedMs,
    }];
  });
};

export const TopologyHeatmapPanel = ({ result, onCellSelect }: TopologyHeatmapPanelProps) => {
  const cells = useMemo(() => toCellGrid(result.trace), [result.trace]);
  const maxDuration = useMemo(
    () => cells.reduce((acc, cell) => Math.max(acc, cell.duration), 0),
    [cells],
  );
  return (
    <section>
      <h3>Topology Heatmap</h3>
      <p>Plugin count: {cells.length}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 8 }}>
        {cells.map((cell) => {
          const intensity = maxDuration === 0 ? 0 : Math.round((cell.duration / maxDuration) * 10);
          return (
            <button
              key={`${cell.plugin}-${cell.row}-${cell.col}`}
              type="button"
              onClick={() => onCellSelect(cell)}
              style={{
                minHeight: 60,
                border: `1px solid hsl(${220 - intensity * 20}, 70%, ${60 - intensity}%)`,
                color: '#f8f9fb',
                background: `rgba(20, 60, ${150 + intensity * 10}, 0.2)`,
                borderRadius: 4,
              }}
            >
              <div>{cell.plugin}</div>
              <small>{cell.duration}ms</small>
              <div>
                [{cell.row},{cell.col}]
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
