import { type ReactElement, useMemo } from 'react';
import type { IncidentLabSignal } from '@domain/recovery-incident-lab-core';

interface SignalFrame {
  readonly at: string;
  readonly value: number;
  readonly kind: IncidentLabSignal['kind'];
}

interface ChartProps {
  readonly frames: readonly SignalFrame[];
}

type KindScale<K extends IncidentLabSignal['kind']> = {
  readonly [TKind in K]: number;
};

const clamp = (value: number, max: number): string => `${Math.min(value, max).toFixed(2)}`;

const buildSeriesByKind = (frames: readonly SignalFrame[]): Readonly<Record<IncidentLabSignal['kind'], number[]>> => {
  const capacity = [] as number[];
  const latency = [] as number[];
  const integrity = [] as number[];
  const dependency = [] as number[];

  for (const frame of frames) {
    const bucket = frame.value;
    switch (frame.kind) {
      case 'capacity':
        capacity.push(bucket);
        break;
      case 'latency':
        latency.push(bucket);
        break;
      case 'integrity':
        integrity.push(bucket);
        break;
      case 'dependency':
        dependency.push(bucket);
        break;
      default:
        break;
    }
  }

  return {
    capacity,
    latency,
    integrity,
    dependency,
  };
};

export const AdvancedLabSignalHistoryChart = ({ frames }: ChartProps): ReactElement => {
  const samples = useMemo(() => buildSeriesByKind(frames), [frames]);
  const maxScale = useMemo(() => {
    const all = [...samples.capacity, ...samples.latency, ...samples.integrity, ...samples.dependency];
    return all.length > 0 ? Math.max(...all) : 1;
  }, [samples]);

  const labels = useMemo(() => (Object.keys(samples) as Array<keyof KindScale<IncidentLabSignal['kind']>>), [samples]);

  const rows = useMemo(
    () =>
      labels.map((kind, index) => {
        const values = samples[kind];
        const mean = values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
        const max = values.length === 0 ? 0 : Math.max(...values);
        return {
          kind,
          index,
          count: values.length,
          mean: clamp(mean, maxScale),
          max: clamp(max, maxScale),
          preview: values.slice(0, 4).join(','),
        };
      }),
    [labels, maxScale, samples],
  );

  return (
    <section className="advanced-lab-signal-history-chart">
      <h3>Signal history chart</h3>
      <table>
        <thead>
          <tr>
            <th>index</th>
            <th>kind</th>
            <th>samples</th>
            <th>mean</th>
            <th>max</th>
            <th>preview</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.index}`}>
              <td>{row.index}</td>
              <td>{row.kind}</td>
              <td>{row.count}</td>
              <td>{row.mean}</td>
              <td>{row.max}</td>
              <td>{row.preview}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
