import { useMemo, useState } from 'react';
import {
  allFusionRoutes,
  classifyRoute,
  routeResolver,
  type FusionRoute,
  type RouteTuple,
} from '@shared/type-level/stress-conditional-fusion-matrix';
import {
  routeLabyrinthCatalog,
  routeLabyrinthEvents,
} from '@shared/type-level/stress-template-route-labyrinth';
import {
  executeControlFlow,
  type BranchEvent,
} from '@shared/type-level/stress-controlflow-galaxy';
import {
  resolveConstraintChain,
  type ConstraintEnvelope,
} from '@shared/type-level/stress-constraint-orchestration-grid';

type ComposerMode = 'all' | 'high' | 'critical';

type ComposerRow = {
  readonly id: number;
  readonly route: FusionRoute;
  readonly domain: string;
  readonly actionClass: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
};

const modeFilter = (mode: ComposerMode, severity: ComposerRow['severity']): boolean => {
  if (mode === 'critical') {
    return severity === 'critical';
  }
  if (mode === 'high') {
    return severity === 'high' || severity === 'critical';
  }
  return true;
};

const mapRoute = (route: FusionRoute): ComposerRow => {
  const payload = classifyRoute(route);
  const severity = payload.severity;
  return {
    id: route.split('/').join('').length,
    route,
    domain: payload.domain,
    actionClass: payload.actionClass,
    severity,
  };
};

export type ComposerSnapshot = {
  readonly selectedRoute: FusionRoute;
  readonly split: RouteTuple;
  readonly routePayload: ReturnType<typeof classifyRoute>;
  readonly routeResolver: ReturnType<typeof routeResolver>;
  readonly labyrinthManifest: string[];
  readonly branchTraceLength: number;
  readonly solver: ConstraintEnvelope<'runtime', 'plan', { name: string; level: number }>;
  readonly branches: BranchEvent[];
  readonly eventsBySeverity: number;
};

export const useTypeLevelStressComposer = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<ComposerMode>('all');

  const rows = useMemo<ComposerRow[]>(() => allFusionRoutes.map(mapRoute), []);
  const filtered = useMemo(() => rows.filter((row) => modeFilter(mode, row.severity)), [rows, mode]);

  const selectedRoute = allFusionRoutes[selectedIndex % allFusionRoutes.length] as FusionRoute;
  const split = selectedRoute.split('/') as unknown as RouteTuple;
  const routePayload = classifyRoute(selectedRoute);
  const routeMeta = routeResolver(selectedRoute);
  const branchEvents = filtered.map((entry, index) => ({
    tag: `branch-${String((index % 45) + 1).padStart(2, '0')}` as BranchEvent['tag'],
    severity:
      (entry.severity === 'low'
        ? 'low'
        : entry.severity === 'medium'
          ? 'medium'
          : entry.severity === 'high'
            ? 'high'
            : 'critical') as BranchEvent['severity'],
    payload: entry.id,
  }));
  const branchTrace = executeControlFlow(branchEvents);

  const routeManifest = useMemo(
    () => Object.values(routeLabyrinthCatalog).map((entry) => `${entry.route}#${entry.timeoutMs}`),
    [],
  );

  const solver = useMemo(() => {
    const chain = resolveConstraintChain('runtime', 'plan');
    return chain.items[0].envelope as ConstraintEnvelope<
      'runtime',
      'plan',
      { name: string; level: number }
    >;
  }, [selectedRoute]);

  const eventsBySeverity = useMemo(() => {
    const severityMap = filtered.reduce<Record<'critical' | 'high' | 'medium' | 'low', number>>(
      (memo, row) => {
        memo[row.severity] += 1;
        return memo;
      },
      { critical: 0, high: 0, medium: 0, low: 0 },
    );
    const key = mode === 'all' ? 'medium' : mode;
    return severityMap[key];
  }, [filtered, mode]);

  const next = () => {
    setSelectedIndex((value) => (value + 1) % allFusionRoutes.length);
  };

  const previous = () => {
    setSelectedIndex((value) => (value - 1 + allFusionRoutes.length) % allFusionRoutes.length);
  };

  const currentSnapshot: ComposerSnapshot = {
    selectedRoute,
    split,
    routePayload,
    routeResolver: routeMeta,
    labyrinthManifest: routeManifest,
    branchTraceLength: branchTrace.trace.length,
    solver,
    branches: branchEvents as BranchEvent[],
    eventsBySeverity,
  };

  return {
    currentSnapshot,
    mode,
    setMode,
    next,
    previous,
    rows: filtered,
    selectedIndex,
    routeRows: Object.keys(routeLabyrinthCatalog),
    branchTrace,
    routeEventsCount: routeLabyrinthEvents.length,
  };
};
