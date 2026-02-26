import { memo, useMemo } from 'react';
import type { RouteCommand, StressCommandRoute } from '../types';

interface StressRouteCatalogGridProps {
  readonly routes: readonly StressCommandRoute[];
  readonly commands: readonly RouteCommand[];
  readonly selected: StressCommandRoute | null;
  readonly onSelect: (route: StressCommandRoute) => void;
}

interface RouteRow {
  readonly route: StressCommandRoute;
  readonly count: number;
  readonly unique: boolean;
}

const compareRoute = (left: StressCommandRoute, right: StressCommandRoute): number => {
  return left.localeCompare(right);
};

export const StressRouteCatalogGrid = ({ routes, commands, selected, onSelect }: StressRouteCatalogGridProps) => {
  const routeRows = useMemo(() => {
    const rows: RouteRow[] = routes
      .map((route) => {
        const count = commands.filter((command) => command.route === route).length;
        return {
          route,
          count,
          unique: count > 0,
        };
      })
      .sort((first, second) => compareRoute(first.route, second.route));

    return rows;
  }, [commands, routes]);

  return (
    <section>
      <h3>Catalog</h3>
      <p>Total routes: {routeRows.length}</p>
      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #ddd', padding: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Command count</th>
              <th>Has commands</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {routeRows.map(({ route, count, unique }) => (
              <tr key={route}>
                <td>{route}</td>
                <td>{count}</td>
                <td>{String(unique)}</td>
                <td>
                  <button type="button" onClick={() => onSelect(route)} disabled={route === selected}>
                    {route === selected ? 'Selected' : 'Select'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const RouteTag = memo(({ route }: { readonly route: StressCommandRoute }) => {
  const tag = useMemo(() => route.split('/').filter(Boolean).join(':'), [route]);
  return <code>{tag}</code>;
});
