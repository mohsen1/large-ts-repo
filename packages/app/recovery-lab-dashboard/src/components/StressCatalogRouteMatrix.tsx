import { useMemo } from 'react';
import type { JSX } from 'react';

import { stressClassChains } from '@shared/type-level';

type MatrixProps = {
  readonly catalog: readonly string[];
  readonly onHighlight: (route: string, isCritical: boolean) => void;
};

type MatrixCell = {
  readonly route: string;
  readonly domain: string;
  readonly action: string;
  readonly severity: string;
  readonly critical: boolean;
};

const toCell = (route: string): MatrixCell => {
  const [action, domain, severity] = route.split(':');
  return {
    route,
    domain: domain ?? 'agent',
    action: action ?? 'discover',
    severity: severity ?? 'low',
    critical: severity === 'critical' || severity === 'emergency',
  };
};

const routeWeight = (input: string): number => {
  const severity = input.split(':')[2] ?? '';
  return severity === 'critical' || severity === 'emergency' ? 100 : severity.length * 7;
};

const renderBucketLabel = (weight: number): string => {
  if (weight >= 100) {
    return 'critical';
  }
  if (weight >= 70) {
    return 'high';
  }
  if (weight >= 40) {
    return 'medium';
  }
  return 'low';
};

export const StressCatalogRouteMatrix = ({ catalog, onHighlight }: MatrixProps): JSX.Element => {
  const chain = useMemo(() => {
    const layers = stressClassChains.stressLayerChain;
    const total = layers.reduce((acc, item) => acc + item.name.length, 0);
    return { total };
  }, []);

  const matrix = useMemo(() => {
    const rows = catalog.map(toCell).map((cell) => {
      const weight = routeWeight(cell.route);
      return {
        ...cell,
        weight,
        zone: renderBucketLabel(weight),
      };
    });

    return rows.reduce<Record<string, MatrixCell[]>>((acc, row) => {
      const key = row.zone;
      acc[key] = acc[key] ? [...acc[key], row] : [row];
      return acc;
    }, {});
  }, [catalog]);

  const zones = useMemo(() => ['low', 'medium', 'high', 'critical'] as const, []);
  const criticalCount = useMemo(
    () => matrix.critical?.filter((entry) => entry.critical).length ?? 0,
    [matrix],
  );

  const totalRoutes = catalog.length + chain.total;

  return (
    <section style={{ border: '1px solid #dde3eb', borderRadius: 8, padding: 12 }}>
      <h3>Stress Catalog Route Matrix</h3>
      <p>Total routes with chain boost: {totalRoutes}</p>
      <p>Critical matches: {criticalCount}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {zones.map((zone) => {
          const group = matrix[zone] ?? [];
          return (
            <div key={zone} style={{ border: '1px solid #eceef2', padding: 8, borderRadius: 6 }}>
              <h4>{zone.toUpperCase()} ({group.length})</h4>
              <ul>
                {group.slice(0, 8).map((row) => (
                  <li key={row.route}>
                    <button
                      type="button"
                      onClick={() => onHighlight(row.route, row.critical)}
                      style={{ display: 'block' }}
                    >
                      {row.domain} / {row.action} / {row.severity}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
};
