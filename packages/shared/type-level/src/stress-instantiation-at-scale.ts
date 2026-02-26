import type { Brand } from './patterns';
import type { RouteTemplateUnion, ParseRouteTemplate } from './stress-template-map-recursion';
import type { BuildTuple, Decrement } from './stress-recursive-fabric-core';

export type SolverConstraint =
  | 'planner'
  | 'validator'
  | 'router'
  | 'executor'
  | 'notifier'
  | 'auditor'
  | 'synthesizer';

export type ConstraintInput = Readonly<{
  readonly tenant: Brand<string, 'tenant-id'>;
  readonly namespace: string;
}>;

export type ConstraintOutput<TToken extends string> = {
  readonly token: Brand<TToken, 'solver-token'>;
  readonly score: number;
  readonly routeCount: number;
};

export interface SolverContext<T extends string = string> {
  readonly name: Brand<T, 'solver'>;
  readonly constraints: readonly SolverConstraint[];
}

export type NoInfer<T> = [T][T extends any ? 0 : never];

const tenantId = (tenant: string): Brand<string, 'tenant-id'> => tenant as Brand<string, 'tenant-id'>;

type ResolveOutput<C extends string, P extends SolverConstraint> =
  P extends 'planner'
    ? { readonly planner: C; readonly state: 'planned'; readonly active: true }
    : P extends 'validator'
      ? { readonly validator: C; readonly state: 'validated'; readonly valid: boolean }
      : P extends 'router'
        ? { readonly router: C; readonly state: 'routed'; readonly routes: readonly RouteTemplateUnion[] }
        : P extends 'executor'
          ? { readonly executor: C; readonly state: 'executed'; readonly cost: number }
          : P extends 'notifier'
            ? { readonly notifier: C; readonly state: 'notified'; readonly messages: number }
            : P extends 'auditor'
              ? { readonly auditor: C; readonly state: 'audited'; readonly warnings: ReadonlyArray<string> }
              : { readonly synthesizer: C; readonly state: 'synced'; readonly delta: readonly string[] };

export type SolverChain<C extends string, K extends readonly SolverConstraint[]> = K extends readonly [infer Head, ...infer Tail]
  ? Head extends SolverConstraint
    ? Tail extends SolverConstraint[]
      ? ResolveOutput<C, Head> & { readonly tail: SolverChain<C, Tail> }
      : { readonly tail: never }
    : { readonly tail: never }
  : { readonly completed: true; readonly terminal: C };

export const makeResolver = <
  TRoute extends RouteTemplateUnion,
  const TConstraint extends SolverConstraint,
>(
  route: TRoute,
  constraint: TConstraint,
  context: NoInfer<ConstraintInput>,
): ConstraintOutput<`${TRoute}-${TConstraint}`> => {
  const token = `${context.tenant}-${route}-${constraint}` as Brand<`${TRoute}-${TConstraint}`, 'solver-token'>;
  const profile = route.length + context.namespace.length + constraint.length;
  return {
    token,
    score: profile,
    routeCount: route.length,
  };
};

export const createTypedSolver = <TName extends string>(
  name: Brand<TName, 'solver-name'>,
  constraints: readonly SolverConstraint[],
) => {
  const solver = {
    name,
    constraints,
    solve<T extends RouteTemplateUnion>(
      route: T,
      context: ConstraintInput,
    ): ConstraintOutput<`${T}`> {
      const tenant = tenantId(context.tenant as string);
      const token = `${tenant}-${route}` as Brand<`${T}`, 'solver-token'>;
      const chainWeight = constraints.reduce((acc, constraint) => acc + constraint.length, 0);
      return {
        token,
        score: chainWeight + context.namespace.length,
        routeCount: route.length + route.split('/').length,
      };
    },
  };

  return solver;
};

export type HigherOrderSolver<TBase extends SolverContext, TInput> = <TArg>(input: TArg & NoInfer<TInput>) => SolverChain<
  TBase['name'],
  TBase['constraints']
>;

export const buildSolverPipeline = <
  TName extends string,
  TPayload,
  TConstraints extends readonly SolverConstraint[],
>(name: Brand<TName, 'solver'>, constraints: TConstraints) => {
  const base: SolverContext<TName> = {
    name,
    constraints,
  };

  return {
    name: base.name,
    context: base,
    run: (payload: TPayload) => {
      const route = '/agent/discover/live/low' as RouteTemplateUnion;
      return {
        payload,
        context: base.name,
        route,
        parsed: parseRoute(route),
      };
    },
    chain: [] as unknown as SolverChain<TName, TConstraints>,
  };
};

export const makeOverloadedSolver = <TName extends string>(name: Brand<TName, 'solver'>) => {
  const pipeline = buildSolverPipeline(name, ['planner', 'validator', 'executor', 'notifier']);

  return {
    ...pipeline,
    route: (route: RouteTemplateUnion) => {
      const ctx = { tenant: tenantId(`${name}-tenant`), namespace: 'default' };
      return makeResolver(route, 'planner', ctx);
    },
    routeStrict: <T extends RouteTemplateUnion>(route: T, namespace: T['length'] extends number ? string : string) =>
      makeResolver(route, 'router', { tenant: tenantId(`${name}-${namespace}`), namespace }),
    routeWithDepth: <T extends RouteTemplateUnion, D extends number>(route: T, depth: D) => {
      const parsed = parseRoute(route);
      const tuple = depth === 0 ? [route] : createDepthChain(route, depth, [route]);
      return {
        route,
        parsed,
        tuple,
        depth,
      };
    },
  };
};

export const dispatchSuite = () => {
  const s1 = createTypedSolver<'planner'>('planner-core' as Brand<'planner', 'solver-name'>, ['planner', 'validator']);
  const s2 = createTypedSolver('generic-core' as Brand<'generic', 'solver-name'>, ['router', 'executor', 'auditor', 'notifier']);
  const s3 = createTypedSolver('adaptive-core' as Brand<'adaptive', 'solver-name'>, ['planner', 'synthesizer']);

  const routeA = '/agent/discover/live/low' as RouteTemplateUnion;
  const routeB = '/mesh/dispatch/live/high' as RouteTemplateUnion;
  const routeC = '/incident/recover/simulation/high' as RouteTemplateUnion;

  const batchOne = [
    s1.solve(routeA, { tenant: tenantId('tenant-a'), namespace: 'stress' }),
    s1.solve(routeB, { tenant: tenantId('tenant-b'), namespace: 'ops' }),
    s2.solve(routeC, { tenant: tenantId('tenant-c'), namespace: 'intake' }),
  ];

  const pipeline = buildSolverPipeline('pipeline-core' as Brand<'pipeline', 'solver'>, ['planner', 'router', 'executor']);
  const dispatched = [
    pipeline.run({ route: routeA }),
    pipeline.run({ route: routeB }),
    pipeline.run({ route: routeC }),
  ];

  const overload = makeOverloadedSolver('overload' as Brand<'overload', 'solver'>);
  const routeDepth = overload.routeWithDepth(routeA, 8);

  return {
    batchOne,
    dispatched,
    routeDepth,
    overloadRoute: overload.route(routeB),
  };
};

export type RouteParsed<T extends RouteTemplateUnion> = ParseRouteTemplate<T>;

export type DepthEnvelope<T extends number> = {
  readonly depth: T;
  readonly stack: BuildTuple<T>;
};

export type ConstraintCascade<T extends RouteTemplateUnion, D extends number> = {
  readonly route: T;
  readonly parsed: ParseRouteTemplate<T>;
  readonly depth: D;
  readonly next: D extends 0 ? never : ConstraintCascade<T, Decrement<D>>;
};

export const constraintMatrix = buildSolverPipeline('matrix' as Brand<'matrix', 'solver'>, [
  'planner',
  'validator',
  'router',
  'executor',
  'notifier',
  'auditor',
  'synthesizer',
]);

function parseRoute(route: RouteTemplateUnion): RouteParsed<typeof route> {
  const [root, domain, verb, mode, severity] = route.split('/');
  return {
    domain,
    verb,
    mode,
    severity,
  } as RouteParsed<typeof route>;
}

function createDepthChain<T extends string>(route: T, depth: number, acc: readonly string[] = []): readonly string[] {
  if (depth <= 0) {
    return acc;
  }

  const [, domain, verb, mode] = route.split('/');
  return createDepthChain(route, depth - 1, [...acc, `${domain}-${verb}-${mode}-${depth}`]);
}

export const stressInstantiationResults = dispatchSuite();
