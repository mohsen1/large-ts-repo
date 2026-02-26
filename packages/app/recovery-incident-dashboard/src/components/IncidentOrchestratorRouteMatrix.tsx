import { useMemo } from 'react';
import { routeCatalog, parseRouteCatalog, projectTemplates } from '@shared/type-level/stress-template-route-parser';

interface IncidentOrchestratorRouteMatrixProps {
  readonly seed: number;
}

const routeCellClass = (index: number, score: number) => {
  if (index % 2 === 0) {
    return score > 2 ? 'route-cell even-hot' : 'route-cell even';
  }
  return score > 2 ? 'route-cell odd-hot' : 'route-cell odd';
};

export const IncidentOrchestratorRouteMatrix = ({ seed }: IncidentOrchestratorRouteMatrixProps) => {
  const parsed = useMemo(() => parseRouteCatalog(routeCatalog), []);
  const projected = useMemo(() => {
    return projectTemplates(routeCatalog);
  }, [seed]);

  const rows = useMemo(() => {
    return routeCatalog.map((route, index) => {
      const parsedRoute = parsed[index];
      const matrix = projected[index];
      const score = (route.length + seed + index) % 10;
      return {
        key: `${route}-${seed}-${index}`,
        route,
        family: parsedRoute.family,
        action: parsedRoute.action,
        id: parsedRoute.id,
        projection: matrix?.raw ?? route,
        score,
      };
    });
  }, [parsed, projected, seed]);

  return (
    <section className="route-matrix">
      <h3>Route Matrix</h3>
      <div className="route-grid">
        {rows.map((row) => (
          <article key={row.key} className={routeCellClass(row.score, row.score)}>
            <span className="route-id">{row.id}</span>
            <strong>{row.family}</strong>
            <em>{row.action}</em>
            <p>{row.projection}</p>
            <small>score: {row.score}</small>
          </article>
        ))}
      </div>
    </section>
  );
};
