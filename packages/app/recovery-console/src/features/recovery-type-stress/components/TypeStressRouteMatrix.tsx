import type { ReactElement } from 'react';
import type { TypeStressWorkspaceState } from '../types';

interface Props {
  readonly workspace?: TypeStressWorkspaceState;
}

const sortRoutes = (values: string[]): string[] => [...values].sort((a, b) => a.localeCompare(b));

export const TypeStressRouteMatrix = ({ workspace }: Props): ReactElement => {
  if (!workspace) {
    return <p>No route matrix available</p>;
  }

  const byKind = workspace.records.reduce<Record<string, string[]>>((acc, record) => {
    const list = acc[record.kind] ?? [];
    acc[record.kind] = [...list, record.route];
    return acc;
  }, {});

  return (
    <section className="type-stress-route-matrix">
      <h3>Route Matrix</h3>
      {Object.entries(byKind).map(([kind, routes]) => {
        const stable = routes.filter((route) => route.length > 16);
        const unstable = routes.filter((route) => route.length <= 16);
        return (
          <div key={kind} className="matrix-row">
            <h4>{kind.toUpperCase()}</h4>
            <p>High confidence: {stable.length} | Low confidence: {unstable.length}</p>
            <ul>
              {sortRoutes(routes).map((route) => {
                const risk = route.includes('critical') ? 'critical' : 'standard';
                return (
                  <li key={`${kind}-${route}`} data-risk={risk}>
                    {route}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
};
