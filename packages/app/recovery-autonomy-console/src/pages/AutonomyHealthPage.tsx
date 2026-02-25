import { useAutonomyOverview } from '../hooks/useAutonomyOverview';

interface AutonomyHealthPageProps {
  readonly tenantId: string;
  readonly graphId: string;
}

export const AutonomyHealthPage = ({ tenantId, graphId }: AutonomyHealthPageProps) => {
  const overview = useAutonomyOverview(tenantId, graphId);

  const score = overview.signals.length ? Math.min(100, overview.signals.length * 2) : 0;
  const healthClass = score > 70 ? 'healthy' : score > 30 ? 'degraded' : 'failing';

  return (
    <main style={{ display: 'grid', gap: 16, padding: 20 }}>
      <h1>Autonomy Health</h1>
      <p>{overview.loading ? 'Loading run data…' : `Score: ${score}/100`}</p>
      <p style={{ textTransform: 'capitalize' }}>{healthClass}</p>
      <ul>
        {overview.records.slice(0, 12).map((record) => (
          <li key={record.recordId}>
            {record.stage}: {record.signal.signalType} · {record.createdAt}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void overview.hydrate()}>
        Refresh Health
      </button>
    </main>
  );
};
