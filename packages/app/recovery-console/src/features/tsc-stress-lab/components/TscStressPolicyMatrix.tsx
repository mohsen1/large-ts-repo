import { useMemo } from 'react';

type RiskCell = {
  readonly axis: string;
  readonly value: number;
  readonly threshold: number;
};

type TscStressPolicyMatrixProps = {
  readonly cells: readonly RiskCell[];
  readonly mode: 'run' | 'audit' | 'build' | 'drill' | 'review' | 'satisfy' | 'observe' | 'synchronize';
};

export const TscStressPolicyMatrix = ({ cells, mode }: TscStressPolicyMatrixProps) => {
  const ordered = useMemo(() => [...cells].sort((a, b) => b.value - a.value), [cells]);
  const average = useMemo(() => (ordered.reduce((sum, cell) => sum + cell.value, 0) / Math.max(ordered.length, 1)).toFixed(2), [ordered]);

  const severity = (cell: RiskCell): 'critical' | 'warning' | 'healthy' =>
    cell.value >= cell.threshold * 1.5 ? 'critical' : cell.value >= cell.threshold ? 'warning' : 'healthy';

  return (
    <section
      style={{
        border: '1px solid #2f3450',
        borderRadius: 8,
        padding: 10,
        background: '#0e1626',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <header>
        <h3 style={{ margin: 0 }}>Policy Matrix</h3>
        <p style={{ margin: '0.25rem 0 0 0' }}>mode {mode} · average {average}</p>
      </header>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.4rem' }}>
        {ordered.map((cell) => {
          const level = severity(cell);
          const color = level === 'critical' ? '#ff5a6f' : level === 'warning' ? '#ffd166' : '#6decb9';
          return (
            <li
              key={cell.axis}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.25rem 0.5rem',
                border: `1px solid ${color}`,
                borderRadius: 6,
                color,
              }}
            >
              <span>{cell.axis}</span>
              <span>
                {cell.value} / {cell.threshold} ({level})
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
