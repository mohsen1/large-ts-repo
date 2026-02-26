import { memo, useMemo } from 'react';
import type { ControlMatrixResult } from '@domain/recovery-lab-synthetic-orchestration';

interface StressLabDecisionMatrixProps {
  readonly matrix: ControlMatrixResult;
  readonly domain: string;
  readonly onHighlight?: (route: string) => void;
}

type MatrixCell = {
  readonly row: number;
  readonly column: number;
  readonly value: number;
  readonly enabled: boolean;
  readonly state: 'on' | 'off' | 'warn';
};

const cellColor = (cell: MatrixCell): string => {
  if (cell.state === 'off') return 'bg-slate-200';
  if (cell.state === 'warn') return 'bg-amber-200';
  return 'bg-emerald-200';
};

const bucketByState = (cells: readonly MatrixCell[], wanted: MatrixCell['state']) =>
  cells.filter((cell) => cell.state === wanted);

const normalizeRoute = (route: string) => `${route.split(':')[0]}:${route.split(':')[1]}`;

export const StressLabDecisionMatrix = memo(({ matrix, domain, onHighlight }: StressLabDecisionMatrixProps) => {
  const groups = useMemo(() => ({
    on: bucketByState(matrix.cells, 'on').length,
    warn: bucketByState(matrix.cells, 'warn').length,
    off: bucketByState(matrix.cells, 'off').length,
  }), [matrix.cells]);
  const routeGroups = useMemo(() => matrix.routes.map(normalizeRoute), [matrix.routes]);
  const domains = useMemo(() => new Set(routeGroups), [routeGroups]);

  return (
    <section className="stress-lab-decision-matrix">
      <header>
        <h3>Decision matrix</h3>
        <p>{domain}</p>
      </header>
      <div className="matrix-summary">
        <span>on: {groups.on}</span>
        <span>warn: {groups.warn}</span>
        <span>off: {groups.off}</span>
        <span>routes: {matrix.routes.length}</span>
      </div>
      <div className="matrix-grid">
        {matrix.cells.slice(0, 180).map((cell) => (
          <button
            key={`${cell.row}-${cell.column}-${cell.value}`}
            className={cellColor(cell)}
            type="button"
            onClick={() => {
              onHighlight?.(`${cell.row}:${cell.column}`);
            }}
          >
            {cell.value}
          </button>
        ))}
      </div>
      <ul className="matrix-route-tags">
        {[...domains].slice(0, 24).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
});

StressLabDecisionMatrix.displayName = 'StressLabDecisionMatrix';
