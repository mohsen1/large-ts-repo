import type { Brand } from '@shared/type-level';
import {
  type RouteCatalog,
  type StressCommand,
  type StressDomainUnion,
  type StressVerb,
  type TemplateRoute,
  type RouteProjection,
  stressDomains,
  type ChainedCommandInput,
  type SolverTuple,
  type ResolveCommandSet,
  type DeepInterfaceChain,
  type RecursiveOdd,
  type RecursiveEven,
} from '@shared/type-level';

export type SyntheticTenant = Brand<string, 'SyntheticTenant'>;

export interface SyntheticTopologyNode {
  readonly id: string;
  readonly name: string;
  readonly ownerTeam?: string;
  readonly active?: boolean;
}

export interface SyntheticTopologyEdge {
  readonly from: string;
  readonly to: string;
}

export interface SyntheticTopology {
  readonly tenantId: string;
  readonly nodes: readonly SyntheticTopologyNode[];
  readonly edges: readonly SyntheticTopologyEdge[];
}

export interface SyntheticPlannerInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly command: StressCommand;
  readonly topology: SyntheticTopology;
}

type SyntheticRoute = TemplateRoute<readonly [string], StressVerb>;
type ConstraintChainKey = `${string}:${string}:${string}`;
type StressRouteProjection = RouteProjection<`/recovery/${string}/${string}`>;

export interface SyntheticDraft {
  readonly tenantId: string;
  readonly namespace: string;
  readonly commandGraph: readonly SyntheticRoute[];
  readonly routeProjection: StressRouteProjection;
  readonly nestedChainDepth: DeepInterfaceChain;
}

export interface SyntheticCatalog {
  readonly entities: readonly string[];
  readonly routes: readonly SyntheticRoute[];
}

export type SyntheticRouteRecord = {
  readonly id: Brand<string, 'SyntheticRoute'>;
  readonly route: SyntheticRoute;
  readonly command: StressCommand;
  readonly constraints: ResolveCommandSet<readonly [StressCommand]>;
  readonly tuple: SolverTuple<4>;
};

export type RecursivePlannerState<TStage extends number = 8> = TStage extends 0
  ? {
      readonly stage: 'done';
      readonly routes: readonly SyntheticRouteRecord[];
      readonly chain: RecursiveEven<'complete', 1>;
    }
  : {
      readonly stage: `s${TStage}`;
      readonly routes: readonly SyntheticRouteRecord[];
      readonly chain: RecursiveOdd<{ readonly stage: `s${TStage}` }, DecrementStage<TStage>>;
      readonly next: RecursivePlannerState<DecrementStage<TStage>>;
    };

type DecrementStage<N extends number> = N extends 0
  ? 0
  : `${N}` extends `${infer A extends number}`
    ? A
    : never;

export interface SyntheticPlannerFactory {
  readonly tenantId: SyntheticTenant;
  readonly namespace: string;
  readonly seed: SyntheticPlannerInput;
  readonly catalog: SyntheticCatalog;
}

const routeFor = (domain: string, phase: string): SyntheticRoute => `/dispatch/${domain}/${phase}` as SyntheticRoute;

const makeRouteList = (domains: readonly StressDomainUnion[]): readonly SyntheticRoute[] => {
  return domains.flatMap((domain) => [routeFor(domain, 'synthesis'), routeFor(domain, 'replay')]);
};

export const createSyntheticCatalog = (tenant: string): SyntheticCatalog => {
  const routes = makeRouteList(stressDomains);
  return {
    entities: [...stressDomains],
    routes,
  };
};

const parseRoute = (route: SyntheticRoute) => {
  const [, domain, phase] = route.split('/');
  return {
    domain: domain as StressDomainUnion,
    phase,
  };
};

export const synthesizePlan = (input: SyntheticPlannerInput): SyntheticDraft => {
  const catalog = createSyntheticCatalog(input.tenantId);
  const route = catalog.routes[Math.floor((catalog.routes.length - 1) / 2)] as SyntheticRoute;
  const [, entity, id] = route.split('/') as [string, string, string];
  const projected: StressRouteProjection = {
    service: 'recovery',
    entity,
    id,
    parsed: `/recovery/${entity}/${id}`,
  };
  const _unused = parseRoute(route);

  return {
    tenantId: input.tenantId,
    namespace: input.namespace,
    commandGraph: catalog.routes,
    routeProjection: projected,
    nestedChainDepth: {} as unknown as DeepInterfaceChain,
  };
};

const createRouteRecord = (command: StressCommand, route: SyntheticRoute): SyntheticRouteRecord => ({
  id: `${command}:${route}` as Brand<string, 'SyntheticRoute'>,
  route,
  command,
  constraints: [
    {
      category: 'dispatch',
      severity: 'low',
      domain: 'workload',
      stage: 'dispatch',
    } as const,
  ] as ResolveCommandSet<readonly [typeof command]>,
  tuple: [{} , {}, {}, {}, {}, {}, {}, {}] as unknown as SolverTuple<4>,
});

const toConstraintChain = (commands: readonly StressCommand[]): ChainedCommandInput<ConstraintChainKey> => {
  const command = commands[0] ?? 'discover:workload:low';
  const [verb, domain, severity] = command.split(':') as [string, string, string];
  return {
    verb,
    domain,
    severity,
    route: `/recovery/${verb}:${domain}/${severity}/route`,
  };
};

export const compileSyntheticRoutes = (
  commands: readonly StressCommand[],
  topology: SyntheticTopology,
): {
  readonly records: readonly SyntheticRouteRecord[];
  readonly chain: ChainedCommandInput<ConstraintChainKey>;
  readonly topologySignature: string;
} => {
  const catalog = createSyntheticCatalog(topology.tenantId);
  const selected = commands.length ? commands : (['discover:workload:low'] as readonly StressCommand[]);
  const records = selected.map((command) => createRouteRecord(command, catalog.routes[0]));
  const chain = toConstraintChain(selected);
  return {
    records,
    chain,
    topologySignature: `${topology.tenantId}:${topology.nodes.length}:${topology.edges.length}`,
  };
};

export const defaultSyntheticPlannerFactory: SyntheticPlannerFactory = {
  tenantId: 'tenant-default' as SyntheticTenant,
  namespace: 'synthetic-namespace',
  seed: {
    tenantId: 'tenant-default',
    namespace: 'synthetic-namespace',
    command: 'discover:workload:medium',
    topology: {
      tenantId: 'tenant-default',
      nodes: [],
      edges: [],
    },
  },
  catalog: createSyntheticCatalog('tenant-default'),
};

export const hydrateSyntheticDraft = (draft: SyntheticDraft, extra: { readonly command: StressCommand }): SyntheticDraft => ({
  ...draft,
  commandGraph: [...draft.commandGraph, `/dispatch/store/extra`],
  routeProjection: {
    ...draft.routeProjection,
    parsed: `/recovery/${draft.routeProjection.entity}/${extra.command}`,
  },
});
