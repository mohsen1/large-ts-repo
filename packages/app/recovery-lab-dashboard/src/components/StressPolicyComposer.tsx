import { useMemo, useState } from 'react';
import type { JSX } from 'react';

type StressCatalogRow = {
  readonly action: string;
  readonly domain: string;
  readonly severity: string;
  readonly id: string;
  readonly raw: string;
  readonly route: string;
  readonly signature: string;
};

type RouteEnvelope = {
  readonly section: string;
  readonly domain: string;
  readonly severity: string;
  readonly isSevere: boolean;
};

type ComposerProps = {
  readonly rows: readonly StressCatalogRow[];
  readonly onSelect: (route: string, envelope: RouteEnvelope) => void;
};

const SEV_MAP = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  emergency: 5,
  info: 1,
  unknown: 0,
} as const;

const routeSections = [
  'discover',
  'ingest',
  'materialize',
  'validate',
  'reconcile',
  'synthesize',
  'snapshot',
  'restore',
  'simulate',
  'inject',
  'amplify',
  'throttle',
  'rebalance',
  'reroute',
  'contain',
  'recover',
] as const satisfies readonly string[];

export const StressPolicyComposer = ({ rows, onSelect }: ComposerProps): JSX.Element => {
  const [active, setActive] = useState<string>('discover');
  const profile = useMemo(() => {
    const stats: Record<string, { count: number; severe: number }> = {};
    for (const row of rows) {
      const isSevere = SEV_MAP[row.severity as keyof typeof SEV_MAP] >= 3;
      const current = stats[row.action] ?? { count: 0, severe: 0 };
      current.count += 1;
      if (isSevere) {
        current.severe += 1;
      }
      stats[row.action] = current;
    }

    return Object.entries(stats).map(([action, values]) => ({
      action,
      ...values,
      ratio: values.count === 0 ? 0 : values.severe / values.count,
    }));
  }, [rows]);

  const sectionMap = useMemo(() => {
    const envelope: Record<string, RouteEnvelope[]> = Object.create(null);
    for (const row of rows) {
      const section = routeSections.includes(row.action as (typeof routeSections)[number])
        ? (row.action as (typeof routeSections)[number])
        : row.action;
      const bucket = envelope[section] ?? [];
      bucket.push({
        section,
        domain: row.domain,
        severity: row.severity,
        isSevere: SEV_MAP[row.severity as keyof typeof SEV_MAP] >= 3,
      });
      envelope[section] = bucket;
    }
    return envelope;
  }, [rows]);

  const signatures = useMemo(() => {
    const values: readonly string[] = rows.map((row) => `${row.domain}:${row.action}:${row.severity}`);
    return values;
  }, [rows]);

  const select = (route: string, envelope: RouteEnvelope) => {
    setActive(envelope.section);
    onSelect(route, envelope);
  };

  const hasRoute = (route: string): boolean => route.includes('/') && !route.endsWith('//');

  return (
    <section style={{ border: '1px solid #d8dce2', borderRadius: 8, padding: 12 }}>
      <h3>Stress Policy Composer</h3>
      <p>active section: {active}</p>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {profile.map((entry) => (
          <li key={entry.action}>
            {entry.action}: {entry.count} rows, severe ratio {entry.ratio.toFixed(2)}
          </li>
        ))}
      </ul>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
        {Object.entries(sectionMap).map(([section, values]) => (
          <div key={section} style={{ border: '1px solid #ececec', borderRadius: 6, padding: 8 }}>
            <h4>{section}</h4>
            <p>{values.length} entries</p>
            <ul>
              {values.slice(0, 6).map((entry) => {
                const route = `/${entry.section}/${entry.domain}/${entry.severity}/${signatures.length}`;
                return (
                  <li key={`${entry.section}-${entry.domain}-${entry.severity}`}>
                    <button
                      type="button"
                      disabled={!hasRoute(route)}
                      onClick={() => select(route, entry)}
                    >
                      {route}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};
