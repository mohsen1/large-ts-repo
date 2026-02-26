import { type ReactElement, useMemo, useState } from 'react';
import {
  type OrbitRoute,
  type OrbitScope,
  type OrbitAction,
  type OrbitDomain,
  type OrbitResource,
  type OrbitStage,
  type OrbitPriority,
  type RouteEnvelope,
} from '@shared/type-level/stress-conditional-orbit';
import type { RouteStateTuple } from '@shared/type-level/stress-conditional-orbit';

interface MatrixCell {
  readonly route: OrbitRoute;
  readonly tuple: RouteStateTuple;
  readonly envelope: RouteEnvelope<OrbitRoute>;
  readonly scope: OrbitScope;
  readonly enabled: boolean;
}

interface MatrixProps {
  readonly rows: readonly OrbitDomain[];
  readonly domains: readonly OrbitAction[];
}

const buildSeed = <T,>(items: readonly T[]): T[] => [...items];

export const StressRouteMatrix = ({ rows, domains }: MatrixProps): ReactElement => {
  const [hover, setHover] = useState<RouteStateTuple | null>(null);
  const [filterScope, setFilterScope] = useState<OrbitScope>('global');

  const matrix = useMemo(() => {
    const scopeValues: readonly OrbitScope[] = [
      'global',
      'tenant',
      'cluster',
      'runtime',
      'control-plane',
      'edge',
      'surface',
      'playbook',
      'data-plane',
    ];

    const out: MatrixCell[] = [];

    for (const domain of rows) {
      for (const action of domains) {
        for (const scope of scopeValues) {
          const route = `/${domain}/${action}/${scope}` as OrbitRoute;
          const tuple = routeStateTuple(domain, action, scope);
          const envelope = createRouteEnvelope(route, tuple);

          out.push({
            route,
            tuple,
            envelope,
            scope,
            enabled: tuple.length === 5,
          });
        }
      }
    }

    return out;
  }, [rows, domains]);

  const rendered = useMemo(() => {
    const filtered = matrix.filter((cell) => cell.scope === filterScope);
    const byDomain = new Map<string, MatrixCell[]>();

    for (const cell of filtered) {
      const key = cell.tuple[0] as string;
      const current = byDomain.get(key) ?? [];
      current.push(cell);
      byDomain.set(key, current);
    }

    return [...byDomain.entries()].map(([domain, cells]) => ({ domain, cells }));
  }, [matrix, filterScope]);

  const routeState = useMemo(() => {
    if (!hover) {
      return null;
    }
    return summarizeRoute(hover);
  }, [hover]);

  return (
    <section className="stress-route-matrix">
      <header>
        <h2>Stress Route Matrix</h2>
        <select value={filterScope} onChange={(event) => setFilterScope(event.target.value as OrbitScope)}>
          {(['global', 'tenant', 'cluster', 'runtime', 'edge', 'surface', 'playbook', 'data-plane', 'control-plane'] as OrbitScope[]).map((scope) => (
            <option key={scope} value={scope}>
              {scope}
            </option>
          ))}
        </select>
      </header>

      <div className="matrix-grid">
        {rendered.map(({ domain, cells }) => (
          <article key={domain}>
            <h3>{domain}</h3>
            <ol>
              {cells.map((cell) => {
                const isHover = hover?.[0] === cell.tuple[0] && hover?.[1] === cell.tuple[1];
                return (
                  <li
                    key={cell.route}
                    className={isHover ? 'is-hover' : undefined}
                    onMouseEnter={() => setHover(cell.tuple)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span>{cell.route}</span>
                    <small>{cell.envelope.priority}</small>
                    <strong>{cell.enabled ? 'enabled' : 'disabled'}</strong>
                  </li>
                );
              })}
            </ol>
          </article>
        ))}
      </div>

      <footer>
        {routeState ? <code>{routeState}</code> : <code>hover a route</code>}
      </footer>
    </section>
  );
};

const routeStateTuple = (domain: OrbitDomain, action: OrbitAction, scope: OrbitScope): RouteStateTuple => {
  return [domain, action, scope, 'route'];
};

const routeResource = (domain: OrbitDomain, action: OrbitAction): OrbitResource => {
  if (domain === 'atlas') {
    if (action === 'bootstrap' || action === 'dispatch') {
      return 'session';
    }
  }

  if (domain === 'sentry' && (action === 'guard' || action === 'reconcile' || action === 'heal')) {
    return 'policy';
  }

  if (domain === 'pulse' && action === 'observe') {
    return 'signal';
  }

  return 'manifest';
};

const summarizeRoute = (tuple: RouteStateTuple) => {
  const values = buildSeed(routeStateTuple('atlas', 'bootstrap', 'global'));
  return `${tuple.join('/')}: ${(tuple.length + values.length) % 10}`;
};

const createRouteEnvelope = (route: OrbitRoute, tuple: RouteStateTuple): RouteEnvelope<OrbitRoute> => {
  const resource = routeResource(tuple[0] as OrbitDomain, tuple[1] as OrbitAction);
  return {
    path: route,
    scope: tuple[2] as OrbitScope,
    stage: 'ready' as OrbitStage,
    priority: tuple.length === 4 ? 'low' : ('medium' as OrbitPriority),
    resource,
  } as unknown as RouteEnvelope<OrbitRoute>;
};
