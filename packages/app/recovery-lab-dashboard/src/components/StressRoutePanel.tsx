import { useMemo } from 'react';
import type { EventRoute } from '@shared/type-level';

interface StressRoutePanelProps {
  readonly owner: string;
  readonly routes: readonly EventRoute[];
  readonly labels: readonly string[];
  readonly routeCount: number;
  readonly statusText: string;
}

const severityByIndex = (index: number): 'critical' | 'high' | 'low' | 'medium' =>
  index % 4 === 0 ? 'critical' : index % 3 === 0 ? 'high' : index % 2 === 0 ? 'low' : 'medium';

const domainFromRoute = (route: EventRoute): string => {
  const [, domain] = route.split('/') as [string, string, string, string];
  return domain;
};

const colorForSeverity = (severity: string): string => {
  switch (severity) {
    case 'critical':
      return '#b00020';
    case 'high':
      return '#8b5cf6';
    case 'medium':
      return '#0ea5e9';
    default:
      return '#22c55e';
  }
};

export const StressRoutePanel = ({ owner, routes, labels, routeCount, statusText }: StressRoutePanelProps): React.JSX.Element => {
  const grouped = useMemo(() => {
    const entries = routes.map((route, index) => ({
      route,
      domain: domainFromRoute(route),
      severity: severityByIndex(index),
    }));

    const table = new Map<string, number>();
    for (const entry of entries) {
      table.set(entry.domain, (table.get(entry.domain) ?? 0) + 1);
    }

    const rows = entries.map((entry) => ({
      ...entry,
      color: colorForSeverity(entry.severity),
    }));

    return { table, rows };
  }, [routes]);

  return (
    <section style={{ border: '1px solid #d8dee3', borderRadius: 8, padding: 12 }}>
      <header>
        <h2>{`Stress Routes · ${owner}`}</h2>
        <p>{`${routeCount} route(s), status=${statusText}`}</p>
        <p>{`labels=${labels.join(', ')}`}</p>
      </header>

      <section style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <strong>By domain</strong>
        <ul>
          {[...grouped.table.entries()].map(([domain, count]) => (
            <li key={`${domain}:${count}`}>{`${domain}: ${count}`}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 12 }}>
        <strong>Route catalog</strong>
        <div style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>route</th>
                <th style={{ textAlign: 'left' }}>domain</th>
                <th style={{ textAlign: 'left' }}>severity</th>
              </tr>
            </thead>
            <tbody>
              {grouped.rows.map((entry) => (
                <tr key={entry.route}>
                  <td style={{ color: '#111827' }}>{entry.route}</td>
                  <td>{entry.domain}</td>
                  <td style={{ color: entry.color }}>{entry.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};
