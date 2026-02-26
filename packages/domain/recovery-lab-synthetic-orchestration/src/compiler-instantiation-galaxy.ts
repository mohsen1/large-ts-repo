import {
  type FlowEnvelope,
  type FlowTrace,
  runControlFlowVolcano,
} from '@shared/type-level/stress-control-flow-volcano';
import { instantiateSolver, buildInvocationMatrix } from '@shared/type-level/stress-generic-instantiation-atoll';
import {
  defaultStormCatalog,
  normalizeStormRoute,
  type StormRoute,
} from '@shared/type-level/stress-conditional-union-storm';
import {
  type RouteByEntity,
  type RouteTemplate,
  type RouteByAction,
  type RouteBySeverity,
} from '@shared/type-level/stress-template-route-cosmos';
import { Decrement } from '@shared/type-level/stress-binary-expression-cascade';

export type OrbitMode =
  | 'observe'
  | 'adapt'
  | 'repair'
  | 'verify'
  | 'finalize';

export type OrbitEnvelope<T extends OrbitMode> = {
  readonly mode: T;
  readonly tenant: string;
  readonly route: StormRoute;
  readonly attempt: number;
  readonly active: boolean;
};

type OrbitRouteProjection = {
  route: StormRoute;
  entity: string;
  action: string;
  severity: string;
  id: string;
  mode: string;
  domain: string;
  signature: string;
  verb: string;
  routeSignal: string;
};

export interface OrbitRuntime<TMode extends OrbitMode> {
  readonly mode: TMode;
  readonly queue: readonly StormRoute[];
  readonly trace: readonly FlowTrace[];
  readonly invocationLog: readonly ReturnType<typeof instantiateSolver>[];
  readonly templateByEntity: {
    readonly incident: RouteByEntity<'incident'>;
    readonly workload: RouteByEntity<'workload'>;
    readonly recovery: RouteByEntity<'recovery'>;
    readonly control: RouteByAction<'repair'>;
    readonly policy: RouteBySeverity<'high'>;
  };
}

const orbitRecords = defaultStormCatalog.slice(0, 10);

export const normalizeOrbitTemplate = (route: StormRoute): OrbitRouteProjection => {
  const parsed = normalizeStormRoute(route);
  return {
    route,
    entity: parsed.domain,
    action: parsed.verb,
    severity: parsed.severity,
    id: parsed.id,
    mode: 'default',
    domain: parsed.domain,
    signature: parsed.routeSignal,
    verb: parsed.verb,
    routeSignal: parsed.routeSignal,
  };
};

export const classifyOrbitMode = (route: StormRoute): OrbitMode => {
  const projection = normalizeOrbitTemplate(route);

  if (projection.entity.startsWith('incident')) {
    return 'observe';
  }

  if (projection.action.includes('assess') || projection.action.includes('notify')) {
    return 'verify';
  }

  if (projection.action.includes('repair') || projection.action.includes('recover')) {
    return 'repair';
  }

  if (projection.action.includes('route')) {
    return 'adapt';
  }

  return 'finalize';
};

export const buildFlowRecords = (routes: readonly StormRoute[]): FlowEnvelope[] =>
  routes.map((route, index) => {
    const projection = normalizeOrbitTemplate(route);
    return {
      mode: index % 2 === 0 ? 'discover' : 'recover',
      tenant: projection.domain,
      severity: projection.severity === 'critical' ? 'critical' : 'low',
      routeId: route,
      count: index + 1,
    };
  });

const flowRecords = buildFlowRecords(defaultStormCatalog);

export const orbitTrace = runControlFlowVolcano(flowRecords);

const buildInvocations = () =>
  buildInvocationMatrix(
    [
      { input: 'incident', seed: { route: '/incident/discover/high/R-100' }, tag: 'discover', issuedAt: 1 },
      {
        input: 'workload',
        seed: { route: '/workload/repair/medium/R-101' },
        tag: 'assess',
        issuedAt: 2,
      },
      {
        input: 'policy',
        seed: { route: '/policy/recover/high/R-102' },
        tag: 'repair',
        issuedAt: 3,
      },
      {
        input: 'risk',
        seed: { route: '/risk/route/low/R-103' },
        tag: 'recover',
        issuedAt: 4,
      },
    ] as const,
    ['strict', 'relaxed', 'maintenance'],
  );

const invocationLog = buildInvocations();

export const buildOrbitRuntime = <T extends OrbitMode>(
  routes: readonly StormRoute[],
  mode: T,
): OrbitRuntime<T> => {
  const normalized = routes.map((route) => normalizeOrbitTemplate(route));
  const traced = runControlFlowVolcano(
    routes.map((route, index) => {
      const projection = normalized[index] ?? normalizeOrbitTemplate('/incident/discover/high/R-100');
      return {
        mode: index % 2 === 0 ? 'discover' : 'recover',
        tenant: projection.domain,
        severity: mode === 'repair' ? 'critical' : index % 2 === 0 ? 'high' : 'low',
        routeId: route,
        count: index + 1,
      };
    }),
  );

  const invocation = routes.map((route, index) =>
    instantiateSolver(
      route,
      {
        route,
        projection: normalizeOrbitTemplate(route).signature,
        template: normalizeStormRoute(route).routeSignal,
      },
      `${mode}-${index}`,
    ),
  );

  const templateByEntity = ({
    incident: '/incident/discover/high/R-100',
    workload: '/workload/repair/medium/R-101',
    recovery: '/recovery/simulate/critical/R-102',
    control: '/policy/repair/high/R-103',
    policy: '/policy/archive/high/R-104',
  } as unknown) as {
    incident: RouteByEntity<'incident'>;
    workload: RouteByEntity<'workload'>;
    recovery: RouteByEntity<'recovery'>;
    control: RouteByAction<'repair'>;
    policy: RouteBySeverity<'high'>;
  };

  return {
    mode,
    queue: routes,
    trace: traced,
    invocationLog: invocation,
    templateByEntity,
  };
};

export const orbitRuntimes = [
  buildOrbitRuntime(defaultStormCatalog, 'observe'),
  buildOrbitRuntime(['/incident/discover/high/R-100' as StormRoute], 'repair'),
] as const;

export type OrbitStep = {
  readonly route: StormRoute;
  readonly projection: OrbitRouteProjection;
  readonly mode: OrbitMode;
  readonly trace: OrbitRuntime<OrbitMode>;
};

export const orbitSteps = orbitRuntimes.flatMap((runtime, index) =>
  runtime.queue.map((route) => ({
    route,
    projection: normalizeOrbitTemplate(route),
    mode: index % 2 === 0 ? 'observe' : 'repair',
    trace: runtime,
  } as OrbitStep)),
);

const decrement: Decrement<10> = 9;

export const orbitMeta = {
  records: orbitRecords,
  routeTemplateCount: defaultStormCatalog.length,
  runtimeDepth: decrement,
  routeMap: {
    incident: '/incident/discover/high/R-100',
    workload: '/workload/repair/medium/R-101',
    policy: '/policy/route/high/R-102',
    risk: '/risk/notify/critical/R-103',
  } as const satisfies {
    readonly [key: string]: RouteTemplate;
  },
  flowTraceCount: orbitTrace.length,
  invocationCount: invocationLog.length,
} as const;
