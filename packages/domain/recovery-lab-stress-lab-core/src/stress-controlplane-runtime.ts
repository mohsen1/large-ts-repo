import {
  type OrbitRoute,
  type RouteEnvelope,
  type OrbitScope,
  type OrbitPriority,
  type OrbitDomain,
  type OrbitAction,
} from '@shared/type-level/stress-conditional-orbit';
import {
  type DistinctShardBundle,
  type OrbitBundle,
  composeBundle,
  resolveBundle,
} from '@shared/type-level/stress-disjoint-intersections';
import { type SolverInput, type SolverResult, solveMany, createSolverFactory } from '@shared/type-level/stress-instantiation-hub';
import { type DeepLayerChain } from '@shared/type-level/stress-deep-hierarchy-lattice';
import { StressWorkspaceState, type StressBundle, stressWorkspaceStateSeed, resolveRouteState, stressBundleSeed } from './stress-domain-contracts';

export type RuntimeSignal = {
  readonly route: OrbitRoute;
  readonly envelope: RouteEnvelope<OrbitRoute>;
  readonly bundle: StressBundle;
  readonly startedAt: Date;
};

export type RuntimeBranch =
  | { readonly phase: 'ingest'; readonly route: OrbitRoute }
  | { readonly phase: 'adapt'; readonly route: OrbitRoute }
  | { readonly phase: 'observe'; readonly route: OrbitRoute }
  | { readonly phase: 'repair'; readonly route: OrbitRoute }
  | { readonly phase: 'complete'; readonly route: OrbitRoute };

export interface StressRuntimeSession {
  readonly id: string;
  readonly state: StressWorkspaceState;
  readonly branches: readonly RuntimeBranch[];
  readonly route: OrbitRoute;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly bundles: readonly DistinctShardBundle<string, number>[];
  readonly errors: readonly string[];
}

export interface RuntimeScope {
  readonly namespace: string;
  readonly route: OrbitRoute;
  readonly depth: number;
  readonly chain: DeepLayerChain;
}

export type RuntimeSolverInput = SolverInput & {
  readonly route: OrbitRoute;
  readonly scope: RuntimeScope;
  readonly signal: DistinctShardBundle<string, number>;
};

export class RuntimeDisposer implements AsyncDisposable, Disposable {
  public disposed = false;
  public readonly closed: string[] = [];

  constructor(private readonly sessionId: string) {}

  public [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
    this.closed.push(this.sessionId);
    return Promise.resolve();
  }

  public [Symbol.dispose](): void {
    this.disposed = true;
    this.closed.push(this.sessionId);
  }
}

export class StressRuntime {
  public constructor(
    private readonly route: OrbitRoute,
    private readonly scope: RuntimeScope,
    private readonly branchCount: number,
  ) {}

  public async run(): Promise<StressRuntimeSession> {
    const solverA = createSolverFactory(
      {
        tenant: this.scope.namespace,
        workspace: this.scope.namespace,
      },
      'solver:control-plane',
      ['solver:control-plane'],
      (input: RuntimeSolverInput): SolverResult<string[]> => ({
        ok: true,
        output: [String(input.route), this.scope.namespace, this.scope.route],
        solvedAt: new Date(),
      }),
    );

    const signalSeed: OrbitBundle = {
      namespace: `stress-${this.scope.namespace}`,
      shards: [
        { shard: 'meta', id: `stress-${this.scope.namespace}-meta` },
        { shard: 'route', route: this.scope.route },
        { shard: 'policy', policyVersion: 5 },
      ],
    };
    const signal = resolveBundle(signalSeed);

    const solverResult = solverA.invoke(
      {
        tenant: this.scope.namespace,
        workspace: this.scope.route,
        route: this.route,
        scope: this.scope,
        signal,
      },
      { tenant: this.scope.namespace, workspace: this.scope.route },
    );
    if (!solverResult.ok) {
      throw new Error('solver failed');
    }

    await using disposer = new RuntimeDisposer(`runtime-${this.scope.route}`);
    const bundleState = this.computeBranches(this.branchCount);
    return {
      id: `session-${this.scope.route}`,
      state: stressWorkspaceStateSeed,
      branches: bundleState,
      route: this.route,
      startedAt: Date.now(),
      completedAt: Date.now(),
      bundles: [composeBundle('runtime', 'medium')],
      errors: solverResult.output,
    };
  }

  private resolveRoute(route: OrbitRoute): RouteEnvelope<OrbitRoute> {
    return {
      path: route,
      scope: (this.scope.route.split('/')[3] as OrbitScope) ?? 'global',
      stage: 'steady',
      priority: resolveRoutePriority(route),
      resource: resolveRouteResource(route),
    } as unknown as RouteEnvelope<OrbitRoute>;
  }

  private computeBranches(count: number): RuntimeBranch[] {
    const branches: RuntimeBranch[] = [];
    for (let index = 0; index < count; index += 1) {
      if (index % 5 === 0) {
        branches.push({ phase: 'ingest', route: this.route });
      } else if (index % 5 === 1) {
        branches.push({ phase: 'adapt', route: this.route });
      } else if (index % 5 === 2) {
        branches.push({ phase: 'observe', route: this.route });
      } else if (index % 5 === 3) {
        branches.push({ phase: 'repair', route: this.route });
      } else {
        branches.push({ phase: 'complete', route: this.route });
      }
    }

    return branches;
  }
}

export const createRuntimeScope = (
  namespace: string,
  route: OrbitRoute,
  depth: number,
): RuntimeScope => {
  return {
    namespace,
    route,
    depth,
    chain: {
      depth,
      node: {
        id: 'root',
        edges: [],
      },
    } as unknown as DeepLayerChain,
  };
};

const resolveRoutePriority = (route: OrbitRoute): OrbitPriority => {
  const state = resolveRouteState(route, {
    path: route,
    scope: route.split('/')[2] as OrbitScope,
    stage: 'steady',
    priority: 'medium',
    resource: resolveRouteResource(route),
  } as unknown as RouteEnvelope<OrbitRoute> & { readonly path: OrbitRoute; scope: OrbitScope; stage: 'steady'; priority: OrbitPriority });

  return state === 'live'
    ? 'high'
    : state === 'error'
      ? 'critical'
      : 'low';
 
};

const resolveRouteResource = (route: OrbitRoute): RouteEnvelope<OrbitRoute>['resource'] => {
  const [, domain, action] = route.split('/') as ['', OrbitDomain, OrbitAction];

  if (domain === 'atlas') {
    if (action === 'dispatch') {
      return 'route';
    }

    if (action === 'bootstrap') {
      return 'session';
    }
  }

  if (domain === 'sentry') {
    if (action === 'guard' || action === 'heal' || action === 'reconcile') {
      return 'policy';
    }
  }

  if (domain === 'pulse') {
    if (action === 'observe') {
      return 'signal';
    }
  }

  return 'manifest';
};

export const runControlPlaneSession = async (
  route: OrbitRoute,
  depth: number,
  branchCount: number,
): Promise<StressRuntimeSession> => {
  const sessionScope = createRuntimeScope('stress-lab', route, depth);
  const runtime = new StressRuntime(route, sessionScope, branchCount);
  const session = await runtime.run();

  const resolved = solveMany(
    {
      tenant: sessionScope.namespace,
      workspace: route,
    },
    [
      createSolverFactory(
        {
          tenant: sessionScope.namespace,
          workspace: route,
        },
        'solver:post',
        ['solver:post'],
        (_input, _context) => ({ ok: true, output: { ok: true }, solvedAt: new Date() }),
      ),
    ],
    {
      tenant: sessionScope.namespace,
      workspace: route,
    },
  );

  if (!resolved.ok) {
    return {
      ...session,
      errors: ['post-solve-failed'],
    };
  }

  const combined = stressBundleSeed.map((bundle) =>
    route === bundle.route
      ? {
          ...bundle,
          route,
        }
      : bundle,
  );

  return {
    ...session,
    errors: combined.map((item) => JSON.stringify(item)),
  };
};

export const runRuntimeMatrix = async <T extends OrbitRoute>(
  routes: readonly T[],
  depth: number,
  branchCount: number,
): Promise<readonly StressRuntimeSession[]> => {
  const sessions: StressRuntimeSession[] = [];
  for (const route of routes) {
    const session = await runControlPlaneSession(route, depth, branchCount);
    sessions.push(session);
  }
  return sessions;
};

export const resolveBranchState = (branch: RuntimeBranch): string => {
  switch (branch.phase) {
    case 'ingest':
      return 'branch.ingest';
    case 'adapt':
      return 'branch.adapt';
    case 'observe':
      return 'branch.observe';
    case 'repair':
      return 'branch.repair';
    case 'complete':
      return 'branch.complete';
    default:
      return 'branch.unknown';
  }
};

export const summarizeRuntime = (sessions: readonly StressRuntimeSession[]): {
  readonly count: number;
  readonly byRoute: Record<string, number>;
} => {
  const accumulator = sessions.reduce<Record<string, number>>((result, session) => {
    const key = session.route;
    const next = result[key] ?? 0;
    result[key] = next + 1;
    return result;
  }, {});

  return {
    count: sessions.length,
    byRoute: accumulator,
  };
};

export const flattenErrors = (sessions: readonly StressRuntimeSession[]): readonly string[] => {
  const errors: string[] = [];
  for (const session of sessions) {
    errors.push(...session.errors);
  }
  return errors;
};
