import { useMemo, useState } from 'react';
import { useStressOrchestrator } from '../hooks/useStressOrchestrator';
import { StressRoutePanel } from '../components/StressRoutePanel';
import { StressCommandDeck } from '../components/StressCommandDeck';
import type { EventRoute } from '@shared/type-level';

interface EventEntry {
  readonly id: string;
  readonly event: string;
  readonly route: EventRoute;
  readonly status: 'ok' | 'warn' | 'fail';
}

const normalizeOwner = (owner: string): string => {
  return owner.trim().toLowerCase() || 'ops';
};

const severityFromRoute = (route: EventRoute): 'ok' | 'warn' | 'fail' =>
  route.includes('critical') || route.includes('uuid')
    ? 'fail'
    : route.includes('rid')
      ? 'warn'
      : 'ok';

const toEntries = (routes: readonly EventRoute[]): readonly EventEntry[] =>
  routes.map((route, index) => ({
    id: `${route}-${index}`,
    event: `evt-${index}`,
    route,
    status: severityFromRoute(route),
  }));

const eventSummary = (entries: readonly EventEntry[]): string => {
  const total = entries.length;
  const failed = entries.filter((entry) => entry.status === 'fail').length;
  const warned = entries.filter((entry) => entry.status === 'warn').length;
  const ok = entries.filter((entry) => entry.status === 'ok').length;
  return `entries=${total} fail=${failed} warn=${warned} ok=${ok}`;
};

export const RecoveryStressLabStudioPage = (): React.JSX.Element => {
  const [owner, setOwner] = useState('ops');
  const [selected, setSelected] = useState<EventRoute>('' as EventRoute);
  const [dispatchHistory, setDispatchHistory] = useState<readonly EventEntry[]>([]);
  const state = useStressOrchestrator(owner, true);

  const entries = useMemo(() => toEntries(state.selectedRoutes), [state.selectedRoutes]);

  const statusText = useMemo(() => {
    switch (state.status) {
      case 'error':
        return 'error';
      case 'ready':
        return 'ready';
      case 'running':
        return 'running';
      default:
        return 'idle';
    }
  }, [state.status]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Recovery Lab Stress Studio</h1>

      <section style={{ display: 'grid', gap: 8 }}>
        <label>
          <span>Owner</span>
          <input
            type="text"
            value={owner}
            onChange={(event) => setOwner(normalizeOwner(event.currentTarget.value))}
            placeholder="ops"
          />
        </label>
        <p>{`domain=${state.domain} · ${statusText}`}</p>
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <StressRoutePanel
          owner={state.owner}
          routes={state.selectedRoutes}
          labels={state.labels}
          routeCount={state.routeCount}
          statusText={statusText}
        />

        <StressCommandDeck
          routes={state.selectedRoutes}
          selected={selected}
          onSelect={setSelected}
          onDispatch={(route) => {
            const next: EventEntry = {
              id: `${Date.now()}`,
              event: `dispatch:${route}`,
              route,
              status: 'ok',
            };
            setDispatchHistory((previous) => [...previous, next]);
          }}
        />
      </section>

      <section style={{ border: '1px solid #dfe3e8', borderRadius: 8, padding: 12 }}>
        <h2>Dispatch timeline</h2>
        <p>{eventSummary(entries)}</p>
        <ul>
          {dispatchHistory.map((entry) => (
            <li key={entry.id} style={{ marginBottom: 4 }}>
              {`${entry.event}:${entry.route}:${entry.status}`}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: '1px solid #dfe3e8', borderRadius: 8, padding: 12 }}>
        <h2>State dump</h2>
        <pre style={{ overflow: 'auto' }}>{JSON.stringify(state, null, 2)}</pre>
      </section>
    </main>
  );
};
