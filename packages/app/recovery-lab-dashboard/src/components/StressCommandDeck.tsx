import { useMemo } from 'react';
import type { EventRoute } from '@shared/type-level';

interface StressCommandDeckProps {
  readonly routes: readonly EventRoute[];
  readonly selected: string;
  readonly onSelect: (route: EventRoute) => void;
  readonly onDispatch: (route: EventRoute) => void;
}

const routeSegments = (route: EventRoute): [string, string, string, string] =>
  route.split('/') as [string, string, string, string];

const toAction = (route: EventRoute): string => {
  const [, , action] = routeSegments(route);
  return action;
};

const bucketByAction = (routes: readonly EventRoute[]): Record<string, EventRoute[]> => {
  const out: Record<string, EventRoute[]> = {};
  for (const route of routes) {
    const action = toAction(route);
    out[action] = [...(out[action] ?? []), route];
  }
  return out;
};

const dispatchButton = (route: EventRoute, action: () => void) => (
  <button key={route} type="button" onClick={action} style={{ marginRight: 8, marginBottom: 8 }}>
    {route}
  </button>
);

export const StressCommandDeck = ({ routes, selected, onSelect, onDispatch }: StressCommandDeckProps): React.JSX.Element => {
  const grouped = useMemo(() => bucketByAction(routes), [routes]);
  const sortedActions = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Command deck</h3>
      <p>{`selected=${selected || 'none'}`}</p>
      {sortedActions.map((action) => (
        <article key={action} style={{ marginBottom: 12 }}>
          <h4>{action}</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {grouped[action].map((route) =>
              dispatchButton(route, () => {
                onSelect(route);
                onDispatch(route);
              }),
            )}
          </div>
        </article>
      ))}
      <article>
        <h4>Bulk controls</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => onSelect(routes[0] ?? ('' as EventRoute))}>
            select first
          </button>
          <button
            type="button"
            onClick={() => {
              for (const route of routes) {
                onDispatch(route);
              }
            }}
          >
            dispatch all
          </button>
          <button type="button" onClick={() => onDispatch(routes[0] ?? ('' as EventRoute))}>
            dispatch selected
          </button>
        </div>
      </article>
    </section>
  );
};
