import { type OrbitalRoute, resolveOrbitalProfile } from '@shared/type-level';
import { stressBranchSagaControl, stressDisjointBridge } from '@shared/type-level-hub';
import type { TypeStressFilter, TypeStressKind, TypeStressRecord, TypeStressWorkspaceState, TypeWorklet } from './types';

const baseFilter = {
  kinds: ['catalog', 'resolver', 'workflow', 'validator', 'dispatcher', 'profiler'],
  includeDisabled: true,
  severities: ['low', 'medium', 'high', 'critical'],
} as const satisfies TypeStressFilter;

const seedRoutes = [
  '/atlas/bootstrap/init/catalog',
  '/continuity/admit/probe/domain',
  '/command/connect/steady/agent',
  '/control/govern/finalize/policy',
  '/crypto/audit/probe/vault',
  '/drill/route/probe/signal',
  '/fabric/dispatch/execute/agent',
  '/forecast/forecast/probe/agent',
  '/lifecycle/compose/probe/agent',
  '/mesh/route/stabilize/agent',
  '/observer/synchronize/steady/signal',
  '/policy/authorize/prepare/graph',
  '/quantum/query/analyze/agent',
  '/risk/fortify/repair/signal',
  '/strategy/gather/probe/agent',
  '/telemetry/emit/observe/signal',
] as const satisfies readonly OrbitalRoute[];

const routeSeverity = (route: OrbitalRoute): TypeStressRecord['profile']['severity'] =>
  route.includes('dispatch') || route.includes('critical') ? 'critical' :
  route.includes('query') ? 'high' :
  route.includes('policy') ? 'medium' :
  'low';

const resolveSagaState = (state: 'stable' | 'warning' | 'retry' | 'failed'): 'pass' | 'retry' | 'failed' => {
  return state === 'failed'
    ? 'failed'
    : state === 'retry'
      ? 'retry'
      : 'pass';
};

const outcomeCode = (state: 'stable' | 'warning' | 'retry' | 'failed'): number => {
  return state === 'stable' ? 0 : state === 'warning' ? 1 : state === 'retry' ? 2 : 3;
};

const makeRecord = (route: OrbitalRoute, routeIndex: number): TypeStressRecord => {
  const resolved = resolveOrbitalProfile(route);
  const branch = stressBranchSagaControl.runSagaBranch();
  const bridge = stressDisjointBridge.buildBridge(['anchor', 'span', 'route']);
  const headOutcome = branch.outcomes[0] ?? { state: 'failed' as const, score: 0 };

  return {
    id: `${route}:record:${routeIndex}` as TypeStressRecord['id'],
    tenant: `tenant-${routeIndex}` as TypeStressRecord['tenant'],
    route: route as TypeStressRecord['route'],
    kind: baseFilter.kinds[routeIndex % baseFilter.kinds.length],
    resolver: resolved as TypeStressRecord['resolver'],
    profile: {
      ...bridge,
      id: `${routeIndex}` as never,
      label: `record-${routeIndex}`,
      code: outcomeCode(headOutcome.state),
      outcome: resolveSagaState(headOutcome.state),
      severity: routeSeverity(route),
      kind: 'timeline',
      value: branch.outcomes.reduce<number>((acc, outcome) => acc + outcome.score, 0),
      action: 'audit',
    } as TypeStressRecord['profile'],
  };
};

const workspaceSeed = seedRoutes
  .map((route, index) => makeRecord(route, index))
  .toSorted((left, right) => right.route.length - left.route.length);

const worklets = ['alpha', 'beta', 'gamma', 'delta'].map(
  (name, index): TypeWorklet => ({
    id: `${name}:${index}` as TypeWorklet['id'],
    title: `${name.toUpperCase()} Worklet`,
    nodes: [
      {
        route: seedRoutes[index % seedRoutes.length] as TypeStressRecord['route'],
        kind: baseFilter.kinds[index % baseFilter.kinds.length],
        enabled: index % 2 === 0,
        severity: index % 2 === 0 ? 'high' : 'low',
      },
    ],
    metadata: {
      createdAt: new Date(Date.now() + index * 5000).toISOString(),
      tags: [name, 'generated'],
    },
  }),
);

export const buildTypeStressWorkspace = async (opts?: {
  readonly tenant: string;
  readonly filter?: Partial<TypeStressFilter>;
}): Promise<TypeStressWorkspaceState> => {
  const filter: TypeStressFilter = {
    ...baseFilter,
    ...opts?.filter,
  };

  const active = worklets.filter((worklet) =>
    worklet.nodes.some((node) => filter.kinds.includes(node.kind) && (filter.includeDisabled || node.enabled)),
  );

  const records = workspaceSeed.filter((record) =>
    filter.kinds.includes(record.kind) &&
    (filter.includeDisabled || record.route.length % 2 === 0) &&
    filter.severities.length > 0,
  );

  const score = records.reduce<number>((acc, record, index) => {
    const severityWeight = record.profile.severity === 'critical' ? 5 : record.profile.severity === 'high' ? 3 : 1;
    return acc + severityWeight + index + record.route.length;
  }, 0);

  return {
    workspaceId: `${opts?.tenant ?? 'global'}:${records.length}` as TypeStressWorkspaceState['workspaceId'],
    records,
    active,
    filter,
    score,
  };
};

export const routeCountByKind = (workspace: TypeStressWorkspaceState): ReadonlyMap<TypeStressKind, number> => {
  const totals = new Map<TypeStressKind, number>();
  for (const entry of workspace.records) {
    const count = totals.get(entry.kind) ?? 0;
    totals.set(entry.kind, count + 1);
  }
  return totals;
};

export const buildTypeStressDiagnostics = async (tenant: string) => {
  const asyncResource = new AsyncDisposableStack();
  const resource = {
    id: `stress:${tenant}`,
    [Symbol.asyncDispose]: async () => {
      return Promise.resolve(undefined);
    },
  };
  asyncResource.use(resource as never);
  await asyncResource.disposeAsync();
  return buildTypeStressWorkspace({ tenant, filter: { severities: ['critical', 'high'] } });
};
