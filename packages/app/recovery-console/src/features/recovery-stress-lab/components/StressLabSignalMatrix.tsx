import { useMemo } from 'react';
import type { SignalDensityCell } from '@domain/recovery-stress-lab';

export interface StressLabSignalMatrixProps {
  readonly tenantId: string;
  readonly title: string;
  readonly cells: readonly SignalDensityCell[];
}

type SeverityColor = 'green' | 'yellow' | 'orange' | 'red';

const colorFor = (band: SignalDensityCell['band']): SeverityColor => {
  if (band === 'low') return 'green';
  if (band === 'medium') return 'yellow';
  if (band === 'high') return 'orange';
  return 'red';
};

const formatAge = (ageMinutes: number): string => {
  if (ageMinutes <= 0) return 'just now';
  if (ageMinutes < 60) return `${ageMinutes}m`;
  const hours = Math.floor(ageMinutes / 60);
  return `${hours}h`;
};

const normalize = (cell: SignalDensityCell): number => {
  if (cell.density <= 0) return 0;
  if (cell.density >= 8) return 8;
  return Math.min(8, Math.max(1, Math.round(cell.density)));
};

export const StressLabSignalMatrix = ({ tenantId, title, cells }: StressLabSignalMatrixProps) => {
  const ordered = useMemo(() => [...cells].sort((left, right) => right.density - left.density), [cells]);
  const grouped = useMemo(() => {
    const byClass: Record<SignalDensityCell['class'], SignalDensityCell[]> = {
      availability: [],
      integrity: [],
      performance: [],
      compliance: [],
    };
    for (const cell of ordered) {
      byClass[cell.class].push(cell);
    }
    return byClass;
  }, [ordered]);

  return (
    <section>
      <h3>{title}</h3>
      <p>tenant={tenantId}</p>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {Object.entries(grouped).map(([cls, entries]) => (
          <div key={cls} style={{ border: '1px solid #334155', borderRadius: 8, padding: '0.4rem' }}>
            <strong>{cls}</strong>
            {entries.length === 0 ? <p>no signals</p> : null}
            <ul>
              {entries.slice(0, 6).map((entry) => (
                <li key={entry.signalId}>
                  <span>{entry.signalId}</span>
                  <span style={{ marginLeft: 8 }}>
                    band={entry.band}
                    {' '}
                    density={normalize(entry).toFixed(0)}
                    {' '}
                    color={colorFor(entry.band)}
                    {' '}
                    age={formatAge(entry.ageMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};
