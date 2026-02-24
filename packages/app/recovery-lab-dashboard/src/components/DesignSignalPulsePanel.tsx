import { useMemo } from 'react';
import { useDesignSignalStream } from '../hooks/useDesignSignalStream';
import type { DesignSignalKind } from '@domain/recovery-orchestration-design';

interface SignalWindow {
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly average: number;
}

interface DesignSignalPulsePanelProps {
  readonly tenant: string;
  readonly workspace: string;
  readonly metric: DesignSignalKind;
}

const colorForMetric: Record<DesignSignalKind, string> = {
  health: '#2e7d32',
  capacity: '#0277bd',
  compliance: '#6a1b9a',
  cost: '#ef6c00',
  risk: '#c62828',
};

export const DesignSignalPulsePanel = ({ tenant, workspace, metric }: DesignSignalPulsePanelProps) => {
  const stream = useDesignSignalStream({ tenant, workspace, metric });

  const chartPoints = useMemo(
    () =>
      stream.windows
        .toSorted((left, right) => right.from - left.from)
        .map((window: SignalWindow) => ({
          key: `${window.from}-${window.to}`,
          score: window.average,
          count: window.count,
          from: new Date(window.from).toISOString(),
          to: new Date(window.to).toISOString(),
        })),
    [stream.windows],
  );

  return (
    <section
      style={{
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <h3>Signal pulse panel · {metric}</h3>
      <p>metric={metric} lane={tenant}/{workspace}</p>
      <p>state={stream.loading ? 'loading' : 'ready'} count={stream.signalCount}</p>
      <p>diagnostics={stream.diagnostics.length}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
        {chartPoints.map((point) => (
          <article
            key={point.key}
            style={{
              borderLeft: `4px solid ${colorForMetric[metric]}`,
              padding: 6,
              borderRadius: 4,
            }}
          >
            <div>
              {point.from} - {point.to}
            </div>
            <strong>{point.score.toFixed(2)}</strong>
            <span>count={point.count}</span>
          </article>
        ))}
      </div>
      <button type="button" onClick={() => void stream.refresh()} disabled={stream.loading}>
        refresh
      </button>
      <pre>{chartPoints.toSorted((left, right) => right.score - left.score).map((entry) => `${entry.key}:${entry.score.toFixed(2)}`).join('\n')}</pre>
    </section>
  );
};
