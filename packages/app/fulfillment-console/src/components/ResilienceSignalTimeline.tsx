import { useMemo } from 'react';

interface SignalPoint {
  readonly id: string;
  readonly score: number;
  readonly zone: string;
}

interface Props {
  readonly points: readonly SignalPoint[];
}

const trend = (values: readonly number[]): number[] => {
  const output = [0];
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    output.push(output[index - 1] + delta);
  }
  return output;
};

export const ResilienceSignalTimeline = ({ points }: Props) => {
  const labels = useMemo(() => points.map((point) => point.id), [points]);
  const chart = useMemo(() => trend(points.map((point) => point.score)), [points]);

  return (
    <div>
      <h4>Signal Timeline</h4>
      <svg viewBox="0 0 500 120" style={{ border: '1px solid #ccc', borderRadius: '8px', width: '100%' }}>
        <path
          d={`M0 100 ${chart
            .map((value, index) => {
              const x = (index / Math.max(1, chart.length - 1)) * 500;
              const y = 100 - Math.min(100, value * 7);
              return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(' ')}`}
          fill="none"
          stroke="#3366ff"
          strokeWidth="2"
        />
        {chart.map((value, index) => {
          const x = (index / Math.max(1, chart.length - 1)) * 500;
          const y = 100 - Math.min(100, value * 7);
          return <circle key={`${points[index].id}-${index}`} cx={x} cy={y} r="4" fill="#444" />;
        })}
      </svg>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
        {points.map((point, index) => (
          <span key={`${point.id}-${index}`} style={{ fontSize: '12px' }}>
            {labels[index]}: {point.zone}
          </span>
        ))}
      </div>
    </div>
  );
};
