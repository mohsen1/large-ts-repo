import type { WorkRoute, WorkRouteParts, WorkAction, SeverityToken, WorkDomain } from '@shared/type-level/stress-conditional-union-grid';
import {
  type RoutePayloadMap,
  type MatrixBuilderInput,
  createTemplateOrbit,
  buildTemplateRouteMap,
  makeEventPayload,
} from '@shared/type-level/stress-mapped-template-orbit';
import {
  type SolverInputBase,
  type ConstraintUnion,
  type ConstraintA,
  type ConstraintDispatch,
  buildConstraintGraph,
  evaluateConstraint,
  type SolverFactoryResult,
  buildConstraintResolver,
} from '@shared/type-level/stress-constraint-conflict-suite';
import {
  type BuildSolverChain,
  type SolverProbeInput,
  buildSolverMatrix,
  solveWithMutualRecursion,
  recursiveSolverChain,
} from '@shared/type-level/stress-recursive-template-solver';

export type ControlMode =
  | 'idle'
  | 'prime'
  | 'warm'
  | 'execute'
  | 'throttle'
  | 'fallback'
  | 'escalate'
  | 'drain'
  | 'verify'
  | 'finish';

export type ControlRoute = {
  readonly route: WorkRoute;
  readonly phase: number;
  readonly mode: ControlMode;
  readonly severity: SeverityToken;
};

export type ControlBranchState =
  | {
      readonly branch: 'discover';
      readonly action: 'discover';
      readonly payload: {
        readonly domain: WorkDomain;
        readonly retries: number;
      };
    }
  | {
      readonly branch: 'assess';
      readonly action: 'assess';
      readonly payload: {
        readonly domain: WorkDomain;
        readonly depth: number;
      };
    }
  | {
      readonly branch: 'repair';
      readonly action: 'repair';
      readonly payload: {
        readonly id: string;
        readonly canary: boolean;
      };
    }
  | {
      readonly branch: 'recover';
      readonly action: 'recover';
      readonly payload: {
        readonly policy: string;
        readonly approved: boolean;
      };
    }
  | {
      readonly branch: 'route';
      readonly action: 'route';
      readonly payload: {
        readonly target: string;
        readonly weight: number;
      };
    }
  | {
      readonly branch: 'notify';
      readonly action: 'notify';
      readonly payload: {
        readonly recipients: string[];
      };
    }
  | {
      readonly branch: 'simulate';
      readonly action: 'simulate';
      readonly payload: {
        readonly scenario: string;
        readonly dryRun: boolean;
      };
    }
  | {
      readonly branch: 'archive';
      readonly action: 'archive';
      readonly payload: {
        readonly reason: string;
      };
    }
  | {
      readonly branch: 'verify';
      readonly action: 'verify';
      readonly payload: {
        readonly passed: boolean;
      };
    };

export type BranchDecision<T extends WorkRoute = WorkRoute> = {
  readonly kind: 'accepted' | 'deferred' | 'rejected';
  readonly route: T;
  readonly branch: ControlBranchState['branch'];
  readonly payload: ControlBranchState['payload'];
  readonly depth: number;
};

export type SolverChain<T extends WorkRoute> = BuildSolverChain<T>;

export type ControlSolverFactory<TInput, TOutput> = <TMode extends ControlMode>(input: TInput, mode: TMode) => SolverFactoryResult<TMode, TOutput>;

export interface ControlPayload extends SolverProbeInput {
  readonly mode: ControlMode;
  readonly branches: ReadonlyArray<ControlBranchState>;
  readonly constraints: readonly ConstraintUnion[];
  readonly routeTemplateMap: RoutePayloadMap<{
    readonly route: WorkRoute;
    readonly depth: number;
    readonly details: Record<string, unknown>;
  }>;
}

export type ControlReport<T extends WorkRoute> = {
  readonly route: T;
  readonly trace: ReadonlyArray<BranchDecision<T>>;
  readonly chain: SolverChain<T>;
  readonly score: number;
  readonly constraints: ReadonlyArray<ConstraintDispatch<ConstraintUnion>>;
  readonly dispatchProfile: readonly {
    readonly key: string;
    readonly handled: boolean;
  }[];
  readonly generatedRoutes: string[];
};

export const controlModeScore: Record<ControlMode, number> = {
  idle: 0,
  prime: 1,
  warm: 2,
  execute: 3,
  throttle: 2,
  fallback: 1,
  escalate: 4,
  drain: 5,
  verify: 3,
  finish: 0,
};

const parseRoute = (route: WorkRoute): WorkRouteParts<typeof route> => {
  const parsed = route.split('/') as string[];
  return {
    domain: (parsed[1] ?? 'recovery') as WorkDomain,
    action: (parsed[2] ?? 'notify') as WorkAction,
    id: parsed[3] ?? 'unknown',
    severity: (parsed[4] ?? 'low') as SeverityToken,
    raw: route,
  } as WorkRouteParts<typeof route>;
};

const pickConstraint = (route: WorkRoute): ConstraintUnion => {
  const base: SolverInputBase = {
    tenant: `${route}-tenant`,
    namespace: `${route}-ns`,
  };

  return {
    input: base,
    severity: base.tenant.includes('-') ? 'tenant-prefixed' : 'tenant-raw',
  } as ConstraintA;
};

const routeToBranch = (route: WorkRoute): ControlBranchState => {
  const parts = parseRoute(route);
  const action = parts.action;

  if (action === 'discover') {
    return {
      branch: 'discover',
      action: 'discover',
      payload: {
        domain: parts.domain,
        retries: Math.min(parts.id.length, 12),
      },
    };
  }
  if (action === 'assess') {
    return {
      branch: 'assess',
      action: 'assess',
      payload: {
        domain: parts.domain,
        depth: Math.min(parts.id.length * 2, 99),
      },
    };
  }
  if (action === 'repair') {
    return {
      branch: 'repair',
      action: 'repair',
      payload: {
        id: parts.id,
        canary: parts.id.startsWith('canary'),
      },
    };
  }
  if (action === 'recover') {
    return {
      branch: 'recover',
      action: 'recover',
      payload: {
        policy: `${parts.domain}-policy`,
        approved: true,
      },
    };
  }
  if (action === 'route') {
    return {
      branch: 'route',
      action: 'route',
      payload: {
        target: `${parts.domain}/target`,
        weight: parts.id.length + 10,
      },
    };
  }
  if (action === 'notify') {
    return {
      branch: 'notify',
      action: 'notify',
      payload: {
        recipients: [`ops@${parts.domain}.local`, `site-${parts.id}@example.com`],
      },
    };
  }
  if (action === 'simulate') {
    return {
      branch: 'simulate',
      action: 'simulate',
      payload: {
        scenario: `${parts.domain}-dry-run`,
        dryRun: true,
      },
    };
  }
  if (action === 'archive') {
    return {
      branch: 'archive',
      action: 'archive',
      payload: { reason: `${parts.domain}-retention` },
    };
  }

  return {
    branch: 'verify',
    action: 'verify',
    payload: {
      passed: action !== 'drain' && action !== 'escalate',
    },
  };
};

export const compileControlBranch = <T extends WorkRoute>(route: T): BranchDecision<T> => {
  const parsed = parseRoute(route);
  const branch = routeToBranch(route);
  const decision =
    branch.branch === 'discover' || branch.branch === 'verify'
      ? 'accepted'
      : branch.branch === 'notify'
        ? 'deferred'
        : 'accepted';

  return {
    kind: decision,
    route,
    branch: branch.branch,
    payload: branch.payload,
    depth: parsed.id.length + controlModeScore.execute,
  };
};

const resolveConstraintDecisions = (constraints: readonly ConstraintUnion[]): ReadonlyArray<ConstraintDispatch<ConstraintUnion>> =>
  evaluateConstraint(constraints);

export const runControlFlowScenario = <T extends WorkRoute>(
  routes: ReadonlyArray<T>,
  mode: ControlMode,
  profile: MatrixBuilderInput,
): ControlReport<T> => {
  const routeMap = makeEventPayload(profile);
  const routeTemplate = buildTemplateRouteMap(profile);

  const chain = solveWithMutualRecursion(routes[0] ?? '/recovery/discover/default/low') as unknown as SolverChain<T>;
  const templateKeys = Object.keys(routeTemplate);
  const orbitRows = Object.keys(createTemplateOrbit(profile));

  const traced = routes.flatMap((route) => {
    const branch = compileControlBranch(route);
    const solver = buildSolverMatrix([route, route]);
    const solverOutput = solver[0] ? recursiveSolverChain(route).map((entry) => String(entry)) : [] as ReadonlyArray<string>;

    if (mode === 'idle') {
      return [
        {
          kind: 'deferred',
          route,
          branch: branch.branch,
          payload: branch.payload,
          depth: branch.depth,
        } as BranchDecision<T>,
      ];
    }

    if (mode === 'prime') {
      return [
        {
          kind: branch.kind,
          route,
          branch: branch.branch,
          payload: branch.payload,
          depth: branch.depth,
        } as BranchDecision<T>,
      ];
    }

    switch (mode) {
      case 'warm':
      case 'execute': {
        return solverOutput
          .filter((item, index) => index % 2 === 0)
          .map((item) => ({
            kind: branch.kind,
            route,
            branch: branch.branch,
            payload: branch.payload,
            depth: typeof item === 'string' ? item.length : 0,
          } as BranchDecision<T>));
      }
      case 'throttle': {
        return [
          {
            kind: 'deferred',
            route,
            branch: branch.branch,
            payload: branch.payload,
            depth: solverOutput.length,
          } as BranchDecision<T>,
        ];
      }
      case 'fallback': {
        return solverOutput
          .slice(0, 3)
          .map((item) => ({
            kind: 'rejected',
            route,
            branch: branch.branch,
            payload: branch.payload,
            depth: item.length,
          } as BranchDecision<T>));
      }
      case 'escalate': {
        return solverOutput
          .flatMap((item) =>
            item.length > 0
              ? {
                  kind: branch.kind,
                  route,
                  branch: branch.branch,
                  payload: branch.payload,
                  depth: item.length + branch.depth,
                }
              : {
                  kind: 'deferred',
                  route,
                  branch: branch.branch,
                  payload: branch.payload,
                  depth: branch.depth,
                },
          )
          .slice(0, 5) as BranchDecision<T>[];
      }
      case 'drain': {
        return [0, 1, 2, 3, 4, 5, 6].map((index) => {
          const weight = index * branch.depth;
          return {
            kind: weight > 30 ? 'rejected' : 'deferred',
            route,
            branch: branch.branch,
            payload: branch.payload,
            depth: weight,
          } as BranchDecision<T>;
        });
      }
      case 'verify': {
        return [
          ...solverOutput.map((item) => ({
            kind: item.length === 0 ? 'deferred' : branch.kind,
            route,
            branch: branch.branch,
            payload: branch.payload,
            depth: item.length > 0 ? item.length : branch.depth,
          }) as BranchDecision<T>),
          {
            kind: 'accepted',
            route,
            branch: 'verify',
            payload: {
              passed: true,
            },
            depth: branch.depth,
          } as BranchDecision<T>,
        ];
      }
      case 'finish': {
        return [
          {
            kind: 'accepted',
            route,
            branch: 'verify',
            payload: {
              passed: true,
            },
            depth: solverOutput.length + route.length,
          } as BranchDecision<T>,
        ];
      }
      default: {
        return [];
      }
    }
  });

  const constraints: readonly ConstraintUnion[] = traced.length > 0
    ? traced.map((trace) => pickConstraint(trace.route))
    : [pickConstraint('/recovery/discover/default/low' as T)];

  const dispatch = resolveConstraintDecisions(constraints);
  const dispatchProfile = dispatch.map((value, index) => ({
    key: `${index}:${templateKeys[index % templateKeys.length] ?? orbitRows[index % orbitRows.length] ?? 'route'}`,
    handled: index >= 0,
  }));

  const score = traced.reduce((total, entry) => total + entry.depth, 0) + traced.length;
  const generatedRoutes = [...Object.keys(routeMap.template), ...templateKeys, ...orbitRows];

  return {
    route: traced[0]?.route ?? (routes[0] as T),
    trace: traced,
    chain,
    score,
    constraints: dispatch,
    dispatchProfile,
    generatedRoutes,
  } as ControlReport<T>;
};

export const runControlFlowFromDomain = (domain: WorkDomain, mode: ControlMode) => {
  const routeSet: WorkRoute[] = [
    `/${domain}/discover/${domain}-001/critical` as WorkRoute,
    `/${domain}/assess/${domain}-002/high` as WorkRoute,
    `/${domain}/route/${domain}-003/severe` as WorkRoute,
    `/${domain}/repair/${domain}-004/advisory` as WorkRoute,
    `/${domain}/recover/${domain}-005/critical` as WorkRoute,
    `/${domain}/notify/${domain}-006/notice` as WorkRoute,
    `/${domain}/simulate/${domain}-007/normal` as WorkRoute,
    `/${domain}/archive/${domain}-008/informational` as WorkRoute,
    `/${domain}/verify/${domain}-009/low` as WorkRoute,
  ];

  const payload: MatrixBuilderInput = {
    serviceName: 'recovery-control-lab',
    endpoints: routeSet.map((route) => ({
      path: route,
      method: 'POST',
      payload: { route, quality: route.length },
    })),
    metadata: {
      domain,
      mode,
    },
    options: {
      includeBody: true,
      includeQuery: false,
      includeResponse: true,
    },
  };

  const resolver = buildConstraintResolver(
    'runtime',
    {
      tenant: `${domain}-tenant`,
      namespace: `${domain}-namespace`,
    } as SolverInputBase,
    routeSet,
    { domain },
  );

  const graph = buildConstraintGraph([pickConstraint(routeSet[0])]);
  const profile = runControlFlowScenario(routeSet, mode, payload);

  return {
    resolver,
    graph,
    profile,
    constraints: profile.constraints,
    chain: resolver.config,
  } as {
    readonly resolver: SolverFactoryResult<'runtime', SolverInputBase, WorkRoute[], { domain: WorkDomain } & Record<string, unknown>>;
    readonly graph: ReturnType<typeof buildConstraintGraph>;
    readonly profile: ControlReport<WorkRoute>;
    readonly constraints: ReadonlyArray<ConstraintDispatch<ConstraintUnion>>;
    readonly chain: SolverFactoryResult<'runtime', SolverInputBase, WorkRoute[], { domain: WorkDomain } & Record<string, unknown>>['config'];
  };
};
