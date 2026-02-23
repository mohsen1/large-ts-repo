import { FC, useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { useReadinessForecast, ReadinessPoint } from '../hooks/useReadinessForecast';

export type ReadinessMatrixProps = {
  plan: RecoveryPlan | undefined;
  selectedMode: 'optimistic' | 'balanced' | 'conservative';
};

const deltaColor = (delta: number): string => {
  if (delta > 4) return 'green';
  if (delta > 0) return 'gold';
  if (delta === 0) return 'gray';
  return 'red';
};

const Tile = ({ point }: { point: ReadinessPoint }) => (
  <tr>
    <td>{point.label.slice(11, 19)}</td>
    <td>{point.value.toFixed(1)}</td>
    <td style={{ color: deltaColor(point.delta) }}>{point.delta > 0 ? '+' : ''}{point.delta.toFixed(1)}</td>
  </tr>
);

export const ReadinessMatrix: FC<ReadinessMatrixProps> = ({ plan, selectedMode }) => {
  const points = useReadinessForecast(plan, selectedMode);
  const max = useMemo(() => points.reduce((m, p) => Math.max(m, p.value), 0), [points]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Readiness forecast ({selectedMode})</h3>
      <p>Peak value: {max.toFixed(1)}</p>
      <table>
        <thead>
          <tr>
            <th>Window</th>
            <th>Score</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <Tile key={point.label} point={point} />
          ))}
        </tbody>
      </table>
    </section>
  );
};
