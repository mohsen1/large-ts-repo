import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  type OrbitDomain,
  type OrbitRoute,
  type OrbitAction,
  type OrbitScope,
  type RouteEnvelope,
  type OrbitResource,
  type RouteStateTuple,
  type OrbitStage,
  type OrbitPriority,
} from '@shared/type-level/stress-conditional-orbit';
import { type DistinctShardBundle, composeBundle } from '@shared/type-level/stress-disjoint-intersections';
import { runRuntimeMatrix } from '@domain/recovery-lab-stress-lab-core';

interface PanelProps {
  readonly namespace: string;
  readonly routes: readonly OrbitRoute[];
}

interface DeckState {
  readonly route: OrbitRoute;
  readonly scope: OrbitScope;
  readonly loaded: boolean;
  readonly shard: DistinctShardBundle<string, number>;
  readonly envelope: RouteEnvelope<OrbitRoute>;
}

interface CatalogTile {
  readonly route: OrbitRoute;
  readonly scope: OrbitScope;
  readonly shardName: string;
  readonly state: 'ready' | 'running' | 'completed';
  readonly events: number;
}

const buildCatalog = (routes: readonly OrbitRoute[]): Record<string, RouteEnvelope<OrbitRoute>> => {
  const entries = routes.reduce<Record<string, RouteEnvelope<OrbitRoute>>>((acc, route, index) => {
    const tuple = routeStateTupleFromRoute(route.split('/') as [string, string, string, string]);
    acc[route] = createRouteEnvelope(tuple, index % 3 === 0 ? 'high' : 'medium');
    return acc;
  }, {});

  return entries;
};

export const StressRouteDeck = ({ namespace, routes }: PanelProps): ReactElement => {
  void buildCatalog(routes);
  const [decks, setDecks] = useState<DeckState[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<OrbitRoute | null>(null);
  const [activeCatalog, setActiveCatalog] = useState<boolean>(false);

  useEffect(() => {
    const base = composeBundle(namespace, 'high');
    const computed = routes.map((route): DeckState => {
      const tuple = routeStateTupleFromRoute(route.split('/') as [string, string, string, string]);
      const envelope = createRouteEnvelope(tuple);
      return {
        route,
        scope: tuple[2] as OrbitScope,
        loaded: true,
        shard: base as DistinctShardBundle<string, number>,
        envelope,
      };
    });

    setDecks(computed);
    setActiveCatalog(routes.length > 0);
    if (routes[0]) {
      setSelectedRoute(routes[0]);
    }
  }, [routes, namespace]);

  const summary = useMemo(() => {
    const map = new Map<string, number>();
    for (const deck of decks) {
      const value = map.get(deck.scope) ?? 0;
      map.set(deck.scope, value + 1);
    }

    const sorted = [...map.entries()].sort((left, right) => right[1] - left[1]);
    return sorted;
  }, [decks]);

  const matrixPreview = useMemo(() => {
    const tuples: RouteStateTuple[] = routes.map((route) =>
      routeStateTupleFromRoute(route.split('/') as [string, string, string, string]),
    );

    const preview = tuples.map(([domain, action, scope]) => ({
      route: `/${domain}/${action}/${scope}` as OrbitRoute,
      scope: scope as OrbitScope,
      shardName: `${domain}::${action}`,
      state: 'ready' as const,
      events: scope.length,
    }));

    return preview;
  }, [routes]);

  return (
    <section className="stress-route-deck">
      <header>
        <h2>Stress Route Deck</h2>
        <p>
          {namespace} · {decks.length} routes · {activeCatalog ? 'catalog hot' : 'catalog cold'}
        </p>
      </header>

      <div className="deck-summary">
        {summary.map(([scope, count]) => {
          const state: 'ready' | 'running' | 'completed' = count > 2 ? 'completed' : 'ready';
          return (
            <article key={scope}>
              <h3>{scope}</h3>
              <p>{count}</p>
              <small>{state}</small>
            </article>
          );
        })}
      </div>

      <ul>
        {decks.map((deck) => (
          <li
            key={deck.route}
            className={deck.route === selectedRoute ? 'is-active' : undefined}
          >
            <button
              type="button"
              onClick={() => setSelectedRoute(deck.route)}
            >
              {deck.route}
            </button>
            <small>{deck.scope}</small>
            {deck.loaded ? <span>loaded</span> : <span>loading</span>}
          </li>
        ))}
      </ul>

      <div className="deck-matrix">
        {matrixPreview.map((tile: CatalogTile) => (
          <article key={`${tile.route}:${tile.shardName}`}>
            <h4>{tile.route}</h4>
            <p>{tile.shardName}</p>
            <p>Events: {tile.events}</p>
            <p>Status: {tile.state}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

const routeStateTupleFromRoute = (parts: [string, string, string, string]): RouteStateTuple => {
  const [, domain, action, scope] = parts;
  return [domain as OrbitDomain, action as OrbitAction, scope as OrbitScope, 'route'];
};

const createRouteEnvelope = (tuple: RouteStateTuple, priority: OrbitPriority = tuple.length === 4 ? 'low' : 'medium'): RouteEnvelope<OrbitRoute> => {
  const route = `/${tuple[0]}/${tuple[1]}/${tuple[2]}` as OrbitRoute;
  return {
    path: route,
    scope: tuple[2],
    stage: 'ready' as OrbitStage,
    priority,
    resource: resolveRouteResource(tuple),
  } as RouteEnvelope<OrbitRoute>;
};

const resolveRouteResource = (tuple: RouteStateTuple): OrbitResource => {
  const [domain, action] = tuple;
  if (domain === 'atlas') {
    if (action === 'bootstrap' || action === 'dispatch') {
      return 'session';
    }
  }
  if (domain === 'sentry' && (action === 'guard' || action === 'reconcile')) {
    return 'policy';
  }
  if (domain === 'pulse' && action === 'observe') {
    return 'signal';
  }
  return 'manifest';
};

export const runDeckDiagnostic = async (routes: readonly OrbitRoute[]) => {
  await runRuntimeMatrix(routes, 3, 5);
};
