import { type FC } from 'react';
import type { OrbitRoute, OrbitAction } from '@shared/type-level';
import { warmRouteCatalog } from '../../services/recoveryCockpitStressWorkloadService';

type MatrixBucket = {
  readonly id: OrbitRoute;
  readonly action: OrbitAction;
  readonly enabled: boolean;
  readonly owner: string;
};

type MatrixProps = {
  readonly buckets: readonly MatrixBucket[];
  readonly search: string;
};

const splitRoute = (route: OrbitRoute): string[] => route.split('/') .filter(Boolean);

const statusColor = (enabled: boolean): string => (enabled ? '#3ad29f' : '#f2a154');

const routeKind = (segments: string[]): string => {
  const status = segments[2] ?? '';
  const isActive = status === 'active' || status === 'pending' || status === 'warming';
  const isWarn = status === 'degraded' || status === 'recovering';
  const isEnd = status === 'terminated';
  return isActive ? 'runtime' : isWarn ? 'ops' : isEnd ? 'finalized' : 'archival';
};

const actionTag = (action: OrbitAction): string => {
  return action === 'simulate'
    ? 'analysis'
    : action === 'triage'
      ? 'ops'
      : action === 'restore'
        ? 'recovery'
        : action === 'snapshot'
          ? 'state'
          : action === 'reconcile'
            ? 'merge'
            : action === 'route'
              ? 'network'
              : action === 'secure'
                ? 'defense'
                : action === 'audit'
                  ? 'inspect'
                  : 'default';
};

export const StressRouteMatrix: FC<MatrixProps> = ({ buckets, search }) => {
  const filtered = buckets.filter((entry) => entry.id.includes(search) || entry.action.includes(search));
  const routeRows = filtered.map((entry) => {
    const routeParts = splitRoute(entry.id);
    const kind = routeKind(routeParts);
    const tag = actionTag(entry.action);
    const score = routeParts.length * (entry.enabled ? 4 : 2) + (entry.action.length % 3);
    return {
      ...entry,
      kind,
      tag,
      score,
      domain: routeParts[0] ?? '',
      phase: routeParts[3] ?? '',
    };
  });

  return (
    <section style={{ border: '1px solid #d6d8db', borderRadius: 10, padding: 12, marginTop: 12 }}>
      <h4>Stress route matrix</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {routeRows.map((row) => (
          <span
            key={row.id}
            style={{
              border: `1px solid ${statusColor(row.enabled)}`,
              borderRadius: 12,
              padding: '4px 8px',
              color: statusColor(row.enabled),
              fontSize: 11,
            }}
          >
            {row.id}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12 }}>
        {routeRows.map((row) => {
          const label = `${row.kind}::${row.tag}::${row.phase}`;
          return (
            <div key={`meta-${row.id}`} style={{ marginBottom: 5 }}>
              <div>owner={row.owner}</div>
              <div>domain={row.domain}</div>
              <div>label={label}</div>
              <div>score={row.score}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const DefaultStressMatrix = () => (
  <StressRouteMatrix
    buckets={warmRouteCatalog.map((entry) => ({
      id: entry.route as OrbitRoute,
      action: entry.route.split('/')[2] as OrbitAction,
      enabled: entry.enabled,
      owner: entry.owner,
    }))}
    search=""
  />
);
