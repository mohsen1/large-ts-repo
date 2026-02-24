import { useMemo } from 'react';
import { useStudioTelemetry } from '../hooks/useStudioTelemetry';

interface StudioDashboardProps {
  readonly tenant: string;
  readonly runId: string;
}

export interface StudioTelemetryRow {
  readonly key: string;
  readonly value: string;
}

export const StudioDashboard = ({ tenant, runId }: StudioDashboardProps) => {
  const { live, snapshot } = useStudioTelemetry({ runId, enabled: Boolean(runId) });

  const rows = useMemo<readonly StudioTelemetryRow[]>(
    () => live.map((entry, index) => ({ key: `${tenant}-${index}`, value: entry })),
    [live, tenant],
  );

  if (!snapshot) {
    return <p>no telemetry</p>;
  }

  return (
    <section style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 12 }}>
      <h2>Studio telemetry</h2>
      <p>
        tenant={tenant} run={runId} updated={snapshot.createdAt} events={snapshot.events}
      </p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{snapshot.summary}</pre>
      <ul>
        {rows.slice(-10).map((row) => (
          <li key={row.key}>{row.value}</li>
        ))}
      </ul>
    </section>
  );
};
