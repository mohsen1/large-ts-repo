import { useMemo, useState } from 'react';
import type { EventRoute, EventCatalog } from '@shared/type-level/stress-orion-template-math';
import { eventProfile, eventRouteCatalog, routeTuple } from '@shared/type-level/stress-orion-template-math';
import { OrionOrbitControlBoard } from '../components/OrionOrbitControlBoard';
import { OrionRouteSignalGrid } from '../components/OrionRouteSignalGrid';

type BoardMode = 'compact' | 'expanded' | 'audit' | 'simulate';

export const OrionTemplateControlPage = () => {
  const catalog = eventRouteCatalog as EventCatalog;
  const [selectedRoute, setSelectedRoute] = useState<EventRoute>(catalog[0]);
  const [selectedMode, setSelectedMode] = useState<BoardMode>('compact');
  const [history, setHistory] = useState<readonly EventRoute[]>([catalog[0]]);

  const rows = useMemo(
    () =>
      catalog.map((route) => ({
        id: route,
        route,
        enabled: history.includes(route),
      })),
    [catalog, history],
  );

  const profile = eventProfile;
  const queueLength = (profile.tuple ?? []).length;
  const unionSize = routeTuple.length;

  const summary = useMemo(() => {
    const modes: Readonly<Record<BoardMode, number>> = {
      compact: 10,
      expanded: 20,
      audit: 30,
      simulate: 40,
    };
    return {
      queueLength,
      unionSize,
      modeWeight: modes[selectedMode],
      focusLength: selectedRoute.length,
    };
  }, [queueLength, selectedMode, selectedRoute, unionSize]);

  return (
    <main>
      <h2>Orion Template Control Page</h2>
      <div>
        <p>Mode: {selectedMode}</p>
        <p>Route: {selectedRoute}</p>
        <p>
          Queue: {summary.queueLength}, Union size: {summary.unionSize}, Weight: {summary.modeWeight}, Focus: {summary.focusLength}
        </p>
      </div>
      <OrionOrbitControlBoard
        events={rows}
        onDispatch={(action) => {
          if (action.type === 'start') {
            setSelectedMode(action.mode);
          }
          if (action.type === 'toggle') {
            const next = selectedRoute.includes(action.eventId) ? catalog[0] : catalog[1] ?? catalog[0];
            setSelectedRoute(next);
          }
          if (action.type === 'stop') {
            setHistory([catalog[0]]);
          }
        }}
      />
      <OrionRouteSignalGrid
        mode={selectedMode === 'compact' ? 'table' : 'card'}
        signals={catalog}
        onFocus={(route: EventRoute) => {
          const next = route;
          setSelectedRoute(next);
          setHistory((previous) => [next, ...previous].slice(0, 14));
        }}
      />
      <section>
        <h3>Route Profiles</h3>
        {profile.tuple?.map((entry, index) => {
          return (
            <p key={`${entry.span}-${index}`}>
              {entry.span}/{entry.sector}/{entry.action} — {entry.status}
            </p>
          );
        })}
      </section>
    </main>
  );
};

export default OrionTemplateControlPage;
