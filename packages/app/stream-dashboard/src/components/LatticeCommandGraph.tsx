import { memo, type ReactNode } from 'react';
import type { LatticeSignalEvent } from '@data/recovery-lattice-store';

interface NodeMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

interface LatticeCommandGraphProps {
  readonly title: string;
  readonly metrics: readonly NodeMetric[];
  readonly streamId: string;
  readonly children?: ReactNode;
}

const colorByValue = (value: number): string => {
  if (value < 0.3) return 'var(--color-ok, #22c55e)';
  if (value < 0.7) return 'var(--color-mid, #f59e0b)';
  return 'var(--color-bad, #ef4444)';
};

const getValueRatio = (value: number): number => Math.max(0, Math.min(1, value));

const buildRow = (items: readonly NodeMetric[]): ReactNode[] =>
  items
    .map((metric) => {
      const ratio = getValueRatio(metric.value);
      const color = colorByValue(ratio);
      return (
        <li key={metric.id} style={{ marginBottom: 8 }}>
          <span style={{ marginRight: 8 }}>{metric.label}</span>
          <span
            style={{
              display: 'inline-block',
              width: `${ratio * 100}%`,
              background: color,
              height: 8,
            }}
          />
          <span style={{ marginLeft: 8 }}>{ratio.toFixed(2)}</span>
        </li>
      );
    });

export const LatticeCommandGraph = memo(({ title, metrics, streamId, children }: LatticeCommandGraphProps) => {
  return (
    <section>
      <h2>{title}</h2>
      <p>{streamId}</p>
      <ul>{buildRow(metrics)}</ul>
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </section>
  );
});

export const LatticeSignalPills = ({ events }: { readonly events: readonly LatticeSignalEvent[] }) => {
  const grouped = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.level] = (acc[event.level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.entries(grouped).map(([level, count]) => (
        <span
          key={level}
          style={{
            padding: '4px 8px',
            border: `1px solid ${colorByValue(count / Math.max(1, events.length))}`,
            borderRadius: 999,
          }}
        >
          {level}: {count}
        </span>
      ))}
    </div>
  );
};

export const LatticeSignalBars = ({ events }: { readonly events: readonly LatticeSignalEvent[] }) => {
  const values = events.map((event) => event.score);
  return (
    <div style={{ marginTop: 12 }}>
      {values.map((value, index) => (
        <div
          key={`${value}-${index}`}
          style={{
            height: 6,
            marginBottom: 4,
            width: `${(value * 100).toFixed(2)}%`,
            background: colorByValue(value),
          }}
        />
      ))}
    </div>
  );
};
