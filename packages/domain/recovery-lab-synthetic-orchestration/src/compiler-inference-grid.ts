import {
  type BuildTemplateRouteMap,
  createTemplateOrbit,
} from '@shared/type-level/stress-mapped-template-orbit';
import { NoInfer } from '@shared/type-level/stress-constraint-conflict-suite';
import {
  buildSolverMatrix,
  solveRecursiveRoute,
  recursiveSolverChain,
  normalizeDepth,
  type SolverState,
} from '@shared/type-level/stress-recursive-template-solver';
import {
  type ControlMode,
  type ControlReport,
  runControlFlowScenario,
} from './compiler-control-lab';
import {
  type RouteTemplate,
  type RouteTemplateSignature,
  type SeedRouteUnion,
  seedCatalog,
  buildRouteProfile,
  type WorkRoute,
  type WorkDomain,
  type WorkAction,
  type SeverityToken,
} from '@shared/type-level/stress-conditional-union-grid';

export interface SolverGridInput {
  readonly tenant: string;
  readonly domain: WorkDomain;
  readonly mode: ControlMode;
  readonly count: number;
}

export type InferenceRecord<TMode extends ControlMode, TDomain extends WorkDomain> = {
  readonly tenant: string;
  readonly mode: TMode;
  readonly domain: TDomain;
  readonly routes: readonly WorkRoute[];
  readonly templates: RouteTemplate<TDomain, WorkAction, string, SeverityToken>;
};

export type SolverTuple<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends `/${infer D}/${infer A}/${infer I}/${infer S}`
    ? {
        readonly domain: D;
        readonly action: A;
        readonly id: I;
        readonly severity: S;
      }
    : never;
};

export type InstantiationRecord<T extends ControlMode> =
  | {
      readonly mode: 'idle';
      readonly value: null;
    }
  | {
      readonly mode: Exclude<T, 'idle'>;
      readonly value: { readonly route: WorkRoute; readonly mode: Exclude<T, 'idle'> };
    };

export type InstantiationMatrix<T extends ControlMode> = {
  readonly mode: T;
  readonly count: number;
  readonly record: InstantiationRecord<T>;
  readonly report: ControlReport<WorkRoute>;
};

export interface SolverFactoryResult<TMode extends ControlMode, TOutput> {
  readonly mode: TMode;
  readonly output: TOutput;
  readonly trace: ReadonlyArray<string>;
}

export type SolverFactory<TInput, TOutput> = <TMode extends ControlMode>(
  input: TInput,
  mode: TMode,
) => SolverFactoryResult<TMode, TOutput>;

export const inferRouteTuple = <T extends readonly string[]>(routes: T): SolverTuple<T> => {
  return routes.map((route) => {
    const [, domain, action, id, severity] = route.split('/') as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      domain,
      action,
      id,
      severity,
    } as SolverTuple<T>[number];
  }) as SolverTuple<T>;
};

export const compileInferencePayload = <
  TDomain extends WorkDomain,
  TCount extends number,
  TRouteUnion extends WorkRoute,
>(input: {
  tenant: string;
  domain: TDomain;
  count: TCount;
  routes: readonly TRouteUnion[];
}): InferenceRecord<ControlMode, TDomain> => {
  const profile = buildRouteProfile(input.routes[0] ?? '/recovery/assess/stub/low');

  return {
    tenant: input.tenant,
    mode: input.count > 4 ? 'execute' : 'warm',
    domain: input.domain,
    routes: input.routes,
    templates: (profile?.[0]?.route ?? '/recovery/assess/stub/low') as RouteTemplate<TDomain, WorkAction, string, SeverityToken>,
  };
};

export const buildTemplatePayload = <TRecord extends { readonly route: WorkRoute; readonly severity: SeverityToken }>(
  record: TRecord,
): BuildTemplateRouteMap<TRecord> => {
  const routeTemplate = createTemplateOrbit({
    serviceName: 'solver-grid',
    endpoints: [
      {
        path: record.route,
        method: 'GET',
        payload: record,
      },
    ],
  });

  return routeTemplate as unknown as BuildTemplateRouteMap<TRecord>;
};

export function inferFactories<T extends readonly SolverFactoryResult<ControlMode, SolverState<unknown>>[]>(
  mode: ControlMode,
  ...values: T
): Readonly<{ readonly mode: ControlMode; readonly values: T }>; 
export function inferFactories(
  mode: ControlMode,
  count: number,
  marker: number,
): {
  readonly mode: ControlMode;
  readonly count: number;
  readonly marker: number;
};
export function inferFactories(
  mode: ControlMode,
  ...values: Array<number | readonly SolverFactoryResult<ControlMode, SolverState<unknown>>[]>
):
  | {
      readonly mode: ControlMode;
      readonly values: Array<SolverFactoryResult<ControlMode, SolverState<unknown>>>;
    }
  | {
      readonly mode: ControlMode;
      readonly count: number;
      readonly marker: number;
    } {
  if (Array.isArray(values[0])) {
    return {
      mode,
      values: values[0] as Array<SolverFactoryResult<ControlMode, SolverState<unknown>>>,
    };
  }

  return {
    mode,
    count: (values[0] as number) ?? 0,
    marker: (values[1] as number) ?? 0,
  };
}

export const runInferenceGrid = (input: SolverGridInput): InstantiationMatrix<ControlMode> => {
  const inputRoutes = seedCatalog.slice(0, input.count) as readonly WorkRoute[];
  const profile = runControlFlowScenario(inputRoutes, input.mode, {
    serviceName: 'inference-grid',
    endpoints: inputRoutes.map((route) => ({
      path: route,
      method: input.mode === 'idle' ? 'GET' : 'POST',
      payload: {
        tenant: input.tenant,
        mode: input.mode,
        domain: input.domain,
      },
    })),
  });

  const routeMap = buildTemplatePayload({
    route: inputRoutes[0] ?? '/recovery/assess/fallback/low',
    severity: 'low',
  });

  const matrix = solveRecursiveRoute(inputRoutes[0] ?? '/recovery/recover/fallback/low', normalizeCount(input.count));
  const solver = buildSolverMatrix(inputRoutes);

  const tuple = (inferRouteTuple(inputRoutes) as unknown) as Array<{ readonly domain: string; readonly action: string; readonly id: string; readonly severity: string; }>; 
  const routeSignature = inputRoutes as RouteTemplateSignature<typeof inputRoutes>;
  const routeSignatures = routeSignature as readonly string[];

  const factories = tuple.map((entry) => {
    const solverTrace = recursiveSolverChain(entry.id);
    const localSolve = solveRecursiveRoute(entry.id, 4);
    return {
      mode: input.mode,
      output: {
        route: `/${entry.domain}/${entry.action}/${entry.id}/${entry.severity}` as WorkRoute,
        trace: localSolve,
        tuple,
      },
      trace: solverTrace as ReadonlyArray<string>,
    } as SolverFactoryResult<ControlMode, { route: string; trace: ReadonlyArray<string>; tuple: typeof tuple }>;
  });

  const record: InstantiationRecord<ControlMode> =
    input.mode === 'idle'
      ? { mode: 'idle', value: null }
      : {
          mode: input.mode as Exclude<ControlMode, 'idle'>,
          value: {
            route: inputRoutes[0] ?? '/recovery/assess/fallback/low',
            mode: input.mode as Exclude<ControlMode, 'idle'>,
          },
        };

  return {
    mode: input.mode,
    count: input.count,
    record,
    report: {
      ...profile,
      route: inputRoutes[0] ?? '/recovery/assess/fallback/low',
      score: factories.length + matrix.length + routeSignatures.length,
      constraints: profile.constraints,
      dispatchProfile: [
        ...profile.dispatchProfile,
        ...routeSignatures.map((entry, index) => ({
          key: `signature:${index}` as string,
          handled: `${entry}`.length > 0,
        })),
      ],
      trace: profile.trace,
      chain: factories as unknown as InstantiationMatrix<ControlMode>['report']['chain'],
      generatedRoutes: [...Object.keys(routeMap), ...matrix],
    },
  };
};

export const mapNoInferConstraint = <T>(input: T, route: NoInfer<T>): string => {
  const routeChain = [input, route] as const;
  const normalized = routeChain.filter(Boolean).join(':');
  return normalized as string;
};

export const runInferenceFactorySeries = (seed: ReadonlyArray<WorkRoute>): Array<InstantiationMatrix<ControlMode>> => {
  const modes: readonly ControlMode[] = ['idle', 'prime', 'warm', 'execute', 'verify'];
  return modes.map((entryMode, index) =>
    runInferenceGrid({
      tenant: `tenant-${index}`,
      domain: 'recovery',
      mode: entryMode,
      count: Math.max(3, seed.length),
    }),
  );
};

export const normalizeCount = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 30) return 30;
  return value;
};

export const collectInferenceRoutes = <T extends readonly WorkRoute[]>(routes: T): NoInfer<T> => {
  const all = routes
    .map((route) => `route:${route}`)
    .join('|')
    .split('|')
    .filter(Boolean)
    .map((entry) => entry.replace('route:', '')) as unknown as T[0][];

  return all as unknown as NoInfer<T>;
};
