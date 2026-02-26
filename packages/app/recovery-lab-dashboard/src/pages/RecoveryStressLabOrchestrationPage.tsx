import { useMemo, useState } from 'react';
import { useStressTimeline } from '../hooks/useStressTimeline';
import { StressEventTimeline } from '../components/StressEventTimeline';
import { StressRoutePanel } from '../components/StressRoutePanel';
import { baseCommandCatalog } from '../services/stressRouteCatalog';
import type { EventRoute } from '@shared/type-level';

const buildRoutes = (): readonly EventRoute[] =>
  baseCommandCatalog.map((entry) => entry.route);

const summarizeTimeline = (events: ReturnType<typeof useStressTimeline>['events']) => {
  const domainBuckets = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.domain] = (acc[event.domain] ?? 0) + 1;
    return acc;
  }, {});

  const sorted = [...Object.entries(domainBuckets)].sort((left, right) => right[1] - left[1]);
  return sorted;
};

const routeStatus = (routes: readonly EventRoute[]): string =>
  routes.reduce((acc, route) => `${acc}${acc.length === 0 ? '' : ' | '}${route}`, '');

export const RecoveryStressLabOrchestrationPage = (): React.JSX.Element => {
  const timeline = useStressTimeline();
  const [owner, setOwner] = useState('ops');
  const routes = useMemo(() => buildRoutes().filter(Boolean), []);
  const summary = useMemo(() => summarizeTimeline(timeline.events), [timeline.events]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Recovery Stress Lab Orchestration</h1>

      <section>
        <label>
          Owner
          <input value={owner} onChange={(event) => setOwner(event.currentTarget.value)} />
        </label>
      </section>

      <p>{`active routes: ${routes.length}`}</p>
      <p>{routeStatus(routes).slice(0, 180)}</p>

      <div style={{ border: '1px solid #dfe3e8', borderRadius: 8, padding: 12 }}>
        <h2>Timeline summary</h2>
        <ul>
          {summary.map(([domain, count]) => (
            <li key={domain}>{`${domain}: ${count}`}</li>
          ))}
        </ul>
      </div>

      <StressRoutePanel
        owner={owner}
        routes={routes}
        labels={timeline.domains}
        routeCount={routes.length}
        statusText={`avg=${timeline.avgMetric.toFixed(2)} max=${timeline.maxMetric.toFixed(2)} min=${timeline.minMetric.toFixed(2)}`}
      />

      <StressEventTimeline
        events={timeline.events.map((event) => ({
          id: event.id,
          domain: event.domain,
          phase: event.phase,
          metric: event.metric,
          startedAt: event.at,
          endedAt: event.metric > 30 ? event.at : undefined,
        }))}
      />
    </main>
  );
};
