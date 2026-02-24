import { FC } from 'react';

export type StressLabTrace = {
  readonly pluginId: string;
  readonly status: 'trace' | 'warn' | 'error' | 'ok';
  readonly at: string;
  readonly stage: number;
  readonly message: string;
};

export interface StressLabRunCardProps {
  readonly runId: string;
  readonly tenantId: string;
  readonly phase: string;
  readonly status: 'idle' | 'planning' | 'running' | 'succeeded' | 'failed';
  readonly traces: readonly StressLabTrace[];
  readonly onRefresh: () => void;
}

const statusColor = (status: StressLabRunCardProps['status']) => {
  if (status === 'succeeded') return '#166534';
  if (status === 'running') return '#1d4ed8';
  if (status === 'failed') return '#b91c1c';
  if (status === 'planning') return '#92400e';
  return '#6b7280';
};

export const StressLabRunCard: FC<StressLabRunCardProps> = ({
  runId,
  tenantId,
  phase,
  status,
  traces,
  onRefresh,
}) => {
  const badgeStyle = {
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    color: statusColor(status),
    background: `${statusColor(status)}20`,
  };

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Stress Lab Run</h3>
          <p style={{ margin: 0 }}>{runId || 'no active run'}</p>
        </div>
        <span style={badgeStyle}>{status}</span>
      </header>

      <p style={{ margin: 0 }}>
        tenant={tenantId} phase={phase}
      </p>

      <div>
        <strong>Trace count:</strong> {traces.length}
      </div>

      <button type="button" onClick={onRefresh}>Refresh traces</button>

      <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0, display: 'grid', gap: 6 }}>
        {traces.map((trace) => (
          <li
            key={`${trace.pluginId}-${trace.stage}-${trace.at}`}
            style={{
              border: '1px solid #f3f4f6',
              borderLeft: `4px solid ${trace.status === 'ok' ? '#16a34a' : trace.status === 'warn' ? '#ca8a04' : trace.status === 'error' ? '#dc2626' : '#0ea5e9'}`,
              borderRadius: 6,
              padding: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>{trace.pluginId}</div>
            <small>{trace.at}</small>
            <div>{trace.message}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};
