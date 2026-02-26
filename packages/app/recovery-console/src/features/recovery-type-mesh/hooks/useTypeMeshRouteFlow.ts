import { useCallback, useMemo, useState } from 'react';
import { routeDecision, type RouteDecision } from '../components/TypeMeshTopologyStrip';
import type { RouteFacet } from '@shared/type-level-hub';
import type { MeshMode } from '../types';

export type FlowEvent =
  | {
      readonly kind: 'tick';
      readonly sequence: number;
      readonly route: RouteFacet;
    }
  | {
      readonly kind: 'phase';
      readonly mode: MeshMode;
      readonly decision: RouteDecision;
    };

type UseTypeMeshRouteFlowArgs = {
  readonly mode: MeshMode;
  readonly routes: readonly RouteFacet[];
};

export const useTypeMeshRouteFlow = ({ mode, routes }: UseTypeMeshRouteFlowArgs) => {
  const [sequence, setSequence] = useState(0);
  const [events, setEvents] = useState<readonly FlowEvent[]>([]);

  const snapshot = useMemo(
    () =>
      routes.reduce<Record<RouteDecision, RouteFacet[]>>(
        (acc, route) => {
          const key = routeDecision(route, mode);
          const bucket = acc[key] ?? [];
          bucket.push(route);
          acc[key] = bucket;
          return acc;
        },
        {} as Record<RouteDecision, RouteFacet[]>,
      ),
    [mode, routes],
  );

  const tick = useCallback(() => {
    const next = sequence + 1;
    setSequence(next);
    const fallback = '/signal/observe/event' as RouteFacet;
    const phase = routeDecision(routes[0] ?? fallback, mode);
    const snapshotEvent: FlowEvent = { kind: 'phase', mode, decision: phase };
    const tickerEvent: FlowEvent = {
      kind: 'tick',
      sequence: next,
      route: routes[next % routes.length] ?? fallback,
    };

    setEvents((current) => [...current, snapshotEvent, tickerEvent]);
  }, [mode, routes, sequence]);

  const clear = useCallback(() => {
    setEvents([]);
    setSequence(0);
  }, []);

  return {
    snapshot,
    events,
    sequence,
    tick,
    clear,
  };
};
