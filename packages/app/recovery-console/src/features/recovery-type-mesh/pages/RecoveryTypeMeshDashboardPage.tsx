import type { ChangeEvent, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useRecoveryTypeMeshSession } from '../hooks/useRecoveryTypeMeshSession';
import { useTypeMeshRouteFlow } from '../hooks/useTypeMeshRouteFlow';
import { buildMeshBoard, meshCatalog } from '../types';
import { TypeMeshTopologyStrip } from '../components/TypeMeshTopologyStrip';
import type { RouteFacet } from '@shared/type-level-hub';

const MeshMetrics = ({
  items,
}: {
  readonly items: readonly { readonly key: string; readonly score: number; readonly phase: string; readonly timestamp: string }[];
}): ReactNode => {
  return (
    <ul className="mesh-metrics">
      {items.map((item) => (
        <li key={item.key}>
          <strong>{item.key}</strong>: {item.score} ({item.phase}) @{item.timestamp}
        </li>
      ))}
    </ul>
  );
};

export const RecoveryTypeMeshDashboardPage = () => {
  const [tenant, setTenant] = useState('tenant-alpha');
  const session = useRecoveryTypeMeshSession({ tenant, mode: 'observe' });
  const routeList = useMemo<readonly RouteFacet[]>(
    () => buildMeshBoard(meshCatalog).map((entry) => entry.route as RouteFacet),
    [],
  );

  const flow = useTypeMeshRouteFlow({ mode: session.session.mode, routes: routeList });

  const updateTenant = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTenant(event.target.value || 'tenant-alpha');
  }, []);

  return (
    <section className="mesh-dashboard">
      <h2>Type Mesh Dashboard</h2>
      <label>
        Tenant:
        <input value={tenant} onChange={updateTenant} />
      </label>
      <TypeMeshTopologyStrip routes={routeList} activeMode={session.session.mode} selected={session.selectedPhase} />
      <div style={{ margin: '0.5rem 0' }}>
        {(['observe', 'plan', 'simulate', 'operate', 'review'] as const).map((mode) => (
          <button key={mode} type="button" onClick={() => session.switchPhase(mode)}>
            {mode}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => void session.refresh()}>
        refresh
      </button>
      <button type="button" onClick={() => flow.tick()}>
        step flow
      </button>
      <button type="button" onClick={flow.clear}>
        clear flow
      </button>
      <p>Mode decision: {session.selectedPhase}</p>
      <p>Sequence: {flow.sequence}</p>
      <MeshMetrics items={session.session.metrics} />
      <h3>Filters</h3>
      <p>{session.filtered.join(', ')}</p>
      <h3>Flow Buckets</h3>
      <ul>
        {Object.entries(flow.snapshot).map(([bucket, bucketRoutes]) => (
          <li key={bucket}>
            {bucket}: {bucketRoutes.join(', ')}
          </li>
        ))}
      </ul>
      <h3>Events</h3>
      <ul>
        {flow.events.map((event, index) => {
          if (event.kind === 'tick') {
            return (
              <li key={`${event.kind}-${index}`}>
                tick {event.sequence}: {event.route}
              </li>
            );
          }
          return (
            <li key={`${event.kind}-${index}`}>
              phase {event.mode}: {event.decision}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
