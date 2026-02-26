import {
  type OrbitAction,
  type OrbitDomain,
  type OrbitRoute,
  type OrbitScope,
  orbitRouteSeed,
  type OrbitResource,
  type OrbitStage,
  type OrbitPriority,
  type RouteEnvelope,
  type RouteStateTuple,
} from '@shared/type-level/stress-conditional-orbit';

export type WorkspaceEventKind =
  | 'created'
  | 'validated'
  | 'scheduled'
  | 'dispatched'
  | 'observed'
  | 'reconciled'
  | 'stopped';

export interface WorkspacePlan {
  readonly id: string;
  readonly kind: WorkspaceEventKind;
  readonly domain: OrbitDomain;
  readonly action: OrbitAction;
  readonly scope: OrbitScope;
  readonly route: OrbitRoute;
}

export interface WorkspaceContext {
  readonly tenant: string;
  readonly zone: string;
  readonly route: OrbitRoute;
  readonly envelope: RouteEnvelope<OrbitRoute>;
  readonly plan: WorkspacePlan[];
}

export type WorkspaceSnapshot = {
  readonly workspaceId: string;
  readonly events: readonly WorkspacePlan[];
  readonly state: 'idle' | 'active' | 'error' | 'complete';
  readonly metadata: Record<string, string>;
};

export type BranchRoutePlan =
  | { readonly branch: 'alpha'; readonly route: OrbitRoute; readonly reason: string }
  | { readonly branch: 'beta'; readonly route: OrbitRoute; readonly code: number }
  | { readonly branch: 'gamma'; readonly route: OrbitRoute; readonly active: boolean }
  | { readonly branch: 'delta'; readonly route: OrbitRoute; readonly retries: number };

export const classifyEvent = (route: OrbitRoute, value: number): WorkspaceEventKind => {
  if (value < 0) {
    return 'created';
  }
  if (route.includes('/bootstrap/')) {
    return 'validated';
  }
  if (value === 0) {
    return 'scheduled';
  }
  if (value <= 2) {
    return 'dispatched';
  }
  if (value <= 4) {
    return 'observed';
  }
  if (value <= 6) {
    return 'reconciled';
  }
  return 'stopped';
};

export const buildWorkspacePlan = (route: OrbitRoute, code: number): WorkspacePlan => {
  const [ , domain, action, scope ] = route.split('/') as ['', OrbitDomain, OrbitAction, OrbitScope];
  return {
    id: `plan-${domain}-${action}-${scope}-${code}`,
    kind: classifyEvent(route, code),
    domain,
    action,
    scope,
    route,
  };
};

export const reduceWorkspace = (seed: WorkspaceContext, plan: WorkspacePlan): WorkspaceContext => {
  const nextEvents = [...seed.plan, plan];
  const state = plan.kind === 'stopped' ? 'complete' : seed.plan.length > 2 ? 'active' : 'idle';
  const metadata = {
    ...seed.plan.reduce<Record<string, string>>((acc, item) => {
      acc[item.kind] = (Number(acc[item.kind] ?? '0') + 1).toString();
      return acc;
    }, {}),
    lastKind: plan.kind,
    lastId: plan.id,
  };

  return {
    tenant: seed.tenant,
    zone: seed.zone,
    route: seed.route,
    envelope: seed.envelope,
    plan: nextEvents,
  } as WorkspaceContext & { state: typeof state; metadata: typeof metadata };
};

export const branchDecision = (tuple: RouteStateTuple): BranchRoutePlan => {
  const [domain, action, scope, ...rest] = tuple as [OrbitDomain, OrbitAction, OrbitScope, ...Array<string>];
  const candidate = `/${domain}/${action}/${scope}` as OrbitRoute;

  if (rest.length > 3) {
    return { branch: 'alpha', route: candidate, reason: `rest-depth:${rest.length}` };
  }

  if (rest.length > 2) {
    const code = Number(rest[0] ?? '0');
    return { branch: 'beta', route: candidate, code };
  }

  if (action === 'evaluate' || scope === 'runtime') {
    return { branch: 'gamma', route: candidate, active: true };
  }

  return { branch: 'delta', route: candidate, retries: rest.length };
};

export const routeDecisionMatrix = () => {
  const rows = orbitRouteSeed;
  const out: WorkspacePlan[] = [];

  for (const item of rows) {
    const [,, ,] = item.split('/');
    for (let index = 0; index < 40; index += 1) {
      out.push(buildWorkspacePlan(item, index));
    }
  }

  return out;
};

export const hydrateRouteWorkspace = (route: OrbitRoute): WorkspaceContext => {
  const [, domain, action, scope] = route.split('/') as ['', OrbitDomain, OrbitAction, OrbitScope];
  const plan = buildWorkspacePlan(route, 0);
  const envelope = resolveEnvelope(route, scope, 'ready', routeResourceFromAction(domain, action));

  return {
    tenant: `tenant-${domain}`,
    zone: `zone-${scope}`,
    route,
    envelope,
    plan: [plan],
  };
};

export const expandWorkspace = (routes: readonly OrbitRoute[]): readonly WorkspaceSnapshot[] => {
  const snapshots: WorkspaceSnapshot[] = [];

  for (const route of routes) {
    const context = hydrateRouteWorkspace(route);
    let current = context;
    const plans = routeDecisionMatrix();

    let state: WorkspaceSnapshot['state'] = 'idle';
    const eventCount: Record<string, number> = {};

    for (const plan of plans) {
      if (plan.route !== route) {
        continue;
      }
      current = reduceWorkspace(current, plan) as WorkspaceContext & { state: WorkspaceSnapshot['state'] };
      const nextState =
        plan.kind === 'created'
          ? 'idle'
          : plan.kind === 'validated'
            ? 'active'
            : plan.kind === 'dispatched'
              ? 'active'
              : plan.kind === 'observed'
                ? 'active'
                : plan.kind === 'stopped'
                  ? 'complete'
                  : plan.kind === 'reconciled'
                    ? 'error'
                    : 'idle';
      state = nextState;
      eventCount[plan.kind] = (eventCount[plan.kind] ?? 0) + 1;
      if (state === 'error') {
        break;
      }
    }

    snapshots.push({
      workspaceId: current.tenant,
      events: current.plan,
      state,
      metadata: Object.fromEntries(Object.entries(eventCount).map(([key, value]) => [key, String(value)])),
    });
  }

  return snapshots;
};

export const routeEnvelopeFromTuple = (tuple: RouteStateTuple): RouteEnvelope<OrbitRoute> => {
  const route = `/${tuple[0]}/${tuple[1]}/${tuple[2]}` as OrbitRoute;
  const envelope = resolveEnvelope(route, tuple[2], 'steady', routeResourceFromTuple(tuple));
  return {
    ...envelope,
    path: route,
  } as unknown as RouteEnvelope<OrbitRoute>;
};

const resolveEnvelope = (
  route: OrbitRoute,
  scope: OrbitScope,
  stage: OrbitStage,
  resource: OrbitResource,
  priority: OrbitPriority = 'low',
): RouteEnvelope<OrbitRoute> => {
  return {
    path: route,
    scope,
    stage,
    priority,
    resource,
  } as unknown as RouteEnvelope<OrbitRoute>;
};

const routeResourceFromTuple = (tuple: RouteStateTuple): OrbitResource => {
  const [domain, action] = tuple;
  return routeResourceFromAction(domain, action);
};

const routeResourceFromAction = (domain: OrbitDomain, action: OrbitAction): OrbitResource => {
  if (domain === 'atlas') {
    if (action === 'bootstrap' || action === 'dispatch') {
      return 'session';
    }
  }

  if (domain === 'sentry' && (action === 'guard' || action === 'heal' || action === 'reconcile')) {
    return 'policy';
  }

  if (domain === 'pulse' && action === 'observe') {
    return 'signal';
  }

  return 'manifest';
};

export const routeStateMachine = (seed: WorkspaceContext): WorkspaceSnapshot => {
  const snapshots: WorkspacePlan[] = [...seed.plan];
  let state: WorkspaceSnapshot['state'] = 'idle';
  let stableCount = 0;

  for (const plan of snapshots) {
    switch (plan.kind) {
      case 'created':
        state = 'idle';
        stableCount += 1;
        break;
      case 'validated':
      case 'scheduled':
        state = 'active';
        stableCount += 1;
        break;
      case 'dispatched':
      case 'observed':
        state = 'active';
        stableCount += 2;
        break;
      case 'reconciled':
        state = 'error';
        stableCount = 0;
        break;
      case 'stopped':
        state = 'complete';
        break;
      default:
        break;
    }

    if (state === 'error' && stableCount > 10) {
      break;
    }
  }

  return {
    workspaceId: seed.tenant,
    events: snapshots,
    state,
    metadata: {
      stableCount: String(stableCount),
      zone: seed.zone,
      route: seed.route,
    },
  };
};
