import { useMemo, useState } from 'react';
import {
  chainPolicy,
  makeRouteEnvelope,
  routeSeverity,
  routeDomains,
  routeVerbs,
  routeEntities,
  splitRoute,
  type RouteTuple,
  type RoutePolicy,
} from '@shared/type-level/stress-conditional-convergence';
import { executeBranchGrid, type BranchContext, type BranchToken } from '@shared/type-level/stress-controlflow-branch-arena-extended';
import {
  conflictCatalog,
  conflictDeepState,
  resolveConflicts,
} from '@shared/type-level/stress-solver-conflict-simulator';
import { createArsenalCatalog, instantiateAtScale } from '@shared/type-level/stress-generic-instantiation-arsenal';
import { stressConditionalConvergenceCatalog } from '@shared/type-level/stress-conditional-convergence';

type OrchestratorMode = 'all' | 'critical' | 'stable';

type OrchestratorRow = {
  readonly route: RouteTuple;
  readonly severity: ReturnType<typeof routeSeverity>;
  readonly policy: RoutePolicy<RouteTuple>;
  readonly branch: ReturnType<typeof executeBranchGrid>;
  readonly catalogDomain: (typeof routeDomains)[number];
};

export const useTypeLevelStressOrchestrator = () => {
  const [tokenIndex, setTokenIndex] = useState(0);
  const [mode, setMode] = useState<OrchestratorMode>('all');
  const [search, setSearch] = useState('');

  const routeRows = useMemo(() => {
    const rows: OrchestratorRow[] = [];
    const manifest = stressConditionalConvergenceCatalog.slice(0, 80);
    for (const envelope of manifest) {
      const route = envelope.route;
      const severity = routeSeverity(route);
      const policy = envelope.policy;
      const branchContext: BranchContext = {
        token: `branch-${String(rows.length + 1).padStart(2, '0')}` as BranchToken,
        level: route.length + rows.length,
        region: rows.length % 3 === 0 ? 'us-east' : rows.length % 3 === 1 ? 'eu-west' : 'ap-south',
        healthy: rows.length % 5 !== 0,
        retries: (rows.length % 6) + 1,
        metadata: { severity, policy: route },
        checks: Array.from({ length: 6 }, (_, idx) => idx + rows.length),
      };
      const branch = executeBranchGrid(branchContext.token, branchContext);
      rows.push({
        route,
        severity,
        policy: envelope.policy,
        branch,
        catalogDomain: route.split('/')[0] as (typeof routeDomains)[number],
      });
    }
    return rows;
  }, []);

  const filtered = useMemo(() => {
    return routeRows.filter((entry) => {
      const matchesSearch = !search || entry.route.includes(search);
      const modeMatch = mode === 'all' || (mode === 'critical' && entry.severity === 'critical') || (mode === 'stable' && entry.severity !== 'critical');
      return matchesSearch && modeMatch;
    });
  }, [routeRows, search, mode]);

  const selectedRoute = filtered[tokenIndex % filtered.length]!.route;
  const parsed = splitRoute(selectedRoute)!;
  const branchTrace = filtered[tokenIndex % filtered.length]!.branch;
  const conflictSnapshot = resolveConflicts(conflictDeepState, conflictCatalog);
  const syntheticConflict = resolveConflicts(conflictDeepState, {
    phases: ['init', 'collect', 'resolve', 'finalize'],
    zones: ['network', 'storage', 'execution', 'policy'],
    actions: ['block', 'retry', 'skip', 'escalate', 'heal'],
    envelopes: [
      {
        phase: 'init',
        zone: 'network',
        action: 'block',
        details: {
          prepared: true,
          reason: selectedRoute,
        },
      },
      {
        phase: 'collect',
        zone: 'storage',
        action: 'retry',
        details: {
          collected: 7,
          source: parsed.entity,
        },
      },
      {
        phase: 'resolve',
        zone: 'execution',
        action: 'escalate',
        details: {
          candidates: [selectedRoute, routeVerbs[0]],
          winner: selectedRoute,
        },
      },
      {
        phase: 'finalize',
        zone: 'policy',
        action: 'heal',
        details: {
          completed: true,
          durationMs: 99,
        },
      },
    ],
  });

  const catalogRunbook = useMemo(() => createArsenalCatalog(), []);
  const instantiations = useMemo(() => instantiateAtScale(), []);

  const usingScope = async () => {
    const AsyncDisposableCtor = (globalThis as { AsyncDisposableStack?: { new (): AsyncDisposableStack } }).AsyncDisposableStack;
    if (!AsyncDisposableCtor) {
      return `skip-${routeVerbs[0]}`;
    }
    await using scope = new AsyncDisposableCtor();
    const result = makeRouteEnvelope(selectedRoute, {
      scope: parsed.entity,
      action: parsed.verb,
      policy: chainPolicy(selectedRoute),
      severity: branchTrace.severity,
    });
    return `${result.route}::${result.policy.policy}`;
  };

  const next = () => setTokenIndex((value) => (value + 1) % filtered.length);
  const previous = () => setTokenIndex((value) => (value - 1 + filtered.length) % filtered.length);

  return {
    rows: filtered,
    selectedRoute,
    selectedPolicy: chainPolicy(selectedRoute),
    search,
    setSearch,
    mode,
    setMode,
    next,
    previous,
    branchTrace,
    conflictSnapshot,
    catalogRunbook,
    instantiations,
    routeEntities,
    runScope: usingScope,
    routeCount: filtered.length,
    branchToken: branchTrace.token,
    routeTuple: parsed,
    conflictDepth: 0,
    syntheticConflict,
  };
};

export const useTypeLevelStressOrchestratorMode = (route: RouteTuple) => routeVerbs.includes('route') && route.includes('route');
