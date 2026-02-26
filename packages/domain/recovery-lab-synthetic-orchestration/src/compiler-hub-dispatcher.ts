import { compileControlBranch, runControlFlowScenario } from './compiler-control-lab';
import {
  type FlowEnvelope,
  type FlowTrace,
  runControlFlowVolcano,
} from '@shared/type-level/stress-control-flow-volcano';
import {
  type HubDispatchEnvelope,
  type HubDispatchProfile,
  buildHubDispatchCatalog,
  buildHubInvocations,
  createHubProfile,
  atlasBundle,
} from '@shared/type-level-hub/type-level-hub-dispatch-grid';
import {
  defaultStormCatalog,
  type StormRoute,
  runControlFlowVolcano as runStormControlFlow,
} from '@shared/type-level/stress-conditional-union-storm';
import type { WorkRoute } from '@shared/type-level/stress-conditional-union-grid';

export interface DispatchFacade {
  readonly profile: HubDispatchProfile;
  readonly bundle: HubDispatchEnvelope;
  readonly invocations: ReturnType<typeof buildHubInvocations>;
  readonly trace: readonly FlowTrace[];
}

export type DispatchMode = 'live' | 'sim' | 'canary' | 'offline';

export interface DispatchRequest {
  readonly route: StressHubRoute;
  readonly domain: string;
  readonly tenant: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly workspace: string;
}

export interface DispatchRunContext {
  readonly mode: DispatchMode;
  readonly tenant: string;
  readonly requests: readonly DispatchRequest[];
  readonly startedAt: number;
}

type StressHubRoute = StormRoute;

type SolverRouteMap = Record<string, { request: DispatchRequest }>;

export const createDispatchRequest = (route: StressHubRoute, domain: string): DispatchRequest => ({
  route,
  domain,
  tenant: `tenant-${route}`,
  severity: route.includes('critical') ? 'critical' : 'medium',
  workspace: `${domain}-${route.replace('/', '')}`,
});

const routeFlow = (routes: readonly string[]): FlowEnvelope[] =>
  routes.map((route, index) => ({
    mode: 'discover',
    tenant: `tenant-${route.slice(1, 4)}`,
    severity: index % 2 === 0 ? 'high' : 'critical',
    routeId: route,
    count: index + 1,
  }));

export const defaultDispatchContext = {
  mode: 'live',
  tenant: 'tenant-dispatch',
  requests: defaultStormCatalog.map((route, index) =>
    createDispatchRequest(route, `domain-${index}`),
  ),
  startedAt: Date.now(),
} satisfies DispatchRunContext;

export const buildDispatchFacade = (context: DispatchRunContext): DispatchFacade => {
  const catalog = buildHubDispatchCatalog();
  const profile = createHubProfile(catalog.routes[0] as StressHubRoute);
  const invocations = buildHubInvocations();
  const trace = runStormControlFlow(routeFlow(context.requests.map((request) => request.route)));

  return {
    profile,
    bundle: catalog,
    invocations,
    trace,
  };
};

export const dispatchFacade = buildDispatchFacade(defaultDispatchContext);

const mapRouteToControl = (route: StressHubRoute): WorkRoute => {
  const [domain, action, severity, id] = route.replace(/^\//, '').split('/') as [string, string, string, string];
  return `/${domain}/${action}/${id}/${severity}` as WorkRoute;
};

const controlProfile = (routes: readonly StressHubRoute[]) =>
  routes.map((route) => {
    const controlRoute = mapRouteToControl(route);
    return {
      controlRoute,
      branch: compileControlBranch(controlRoute),
      report: runControlFlowScenario(
        [controlRoute],
        'execute',
        {
          serviceName: 'dispatch',
          endpoints: [
            {
              path: route,
              method: 'POST',
              payload: {
                route,
                tenant: route,
                namespace: route,
              },
            },
          ],
          metadata: {
            domain: route,
            mode: 'execute',
          },
          options: {
            includeBody: true,
            includeQuery: true,
            includeResponse: true,
          },
        },
      ),
    };
  });

export const dispatchProfile = controlProfile(defaultStormCatalog);

export const dispatchRouteMaps = <T extends readonly DispatchRequest[]>(requests: T): SolverRouteMap => {
  const map: Partial<SolverRouteMap> = {};

  for (const request of requests) {
    map[request.route] = {
      request,
    } as SolverRouteMap[keyof SolverRouteMap & string];
  }

  return map as SolverRouteMap;
};

const matrixInput = dispatchRouteMaps(defaultDispatchContext.requests);

export const dispatchHarness = {
  catalog: atlasBundle,
  profile: dispatchProfile,
  requestCount: defaultDispatchContext.requests.length,
  matrix: matrixInput,
} as const;

export const dispatchReplay = (mode: DispatchMode, routes: readonly StressHubRoute[]) => {
  const context: DispatchRunContext = {
    mode,
    tenant: mode,
  requests: routes.map((route, index) => ({
      route,
      domain: `mode-${mode}-${index}`,
      tenant: `tenant-${mode}-${index}`,
      severity: index % 2 === 0 ? 'high' : 'low',
      workspace: `${mode}-ws-${index}`,
    })),
    startedAt: Date.now(),
  };

  return {
    mode,
    routeCount: routes.length,
    routeMap: dispatchRouteMaps(context.requests),
    replayTrace: buildDispatchFacade(context).trace,
    decisionFlow: runControlFlowVolcano(context.requests.map((request, index) => ({
      mode: index % 2 === 0 ? 'repair' : 'discover',
      tenant: request.tenant,
      severity: request.severity === 'medium' ? 'high' : request.severity,
      routeId: request.route,
      count: index + 1,
    }))),
  };
};
