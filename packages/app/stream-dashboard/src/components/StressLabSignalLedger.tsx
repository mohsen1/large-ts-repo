import { useMemo } from 'react';

export interface StressLabSignalLedgerEvent {
  readonly id: string;
  readonly class: string;
  readonly severity: string;
  readonly title: string;
  readonly createdAt: string;
  readonly metadata: Record<string, unknown>;
}

interface SignalLedgerProps {
  readonly events: readonly StressLabSignalLedgerEvent[];
}

export const StressLabSignalLedger = ({ events }: SignalLedgerProps) => {
  const grouped = useMemo(() => {
    const buckets: Record<string, Array<StressLabSignalLedgerEvent>> = {};

    for (const event of events) {
      const key = `${event.class}:${event.severity}`;
      const bucket = buckets[key] ?? [];
      bucket.push(event);
      buckets[key] = bucket;
    }

    return Object.entries(buckets);
  }, [events]);

  const stats = useMemo(() => {
    const critical = events.filter((event) => event.severity === 'critical').length;
    const high = events.filter((event) => event.severity === 'high').length;
    const medium = events.filter((event) => event.severity === 'medium').length;
    const low = events.filter((event) => event.severity === 'low').length;
    return [
      { key: 'critical', value: critical },
      { key: 'high', value: high },
      { key: 'medium', value: medium },
      { key: 'low', value: low },
    ];
  }, [events]);

  return (
    <section>
      <h3>Signal Ledger</h3>
      <div style={{ marginBottom: 8 }}>
        {stats.map((stat) => (
          <strong key={stat.key} style={{ marginRight: 12 }}>
            {stat.key}: {stat.value}
          </strong>
        ))}
      </div>
      <div>
        {grouped.map(([bucket, bucketEvents]) => (
          <details key={bucket}>
            <summary>
              {bucket} ({bucketEvents.length})
            </summary>
            <ul>
              {bucketEvents.map((event) => (
                <li key={event.id}>
                  <p>{event.title}</p>
                  <p>
                    {event.createdAt}: {JSON.stringify(event.metadata)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
};
