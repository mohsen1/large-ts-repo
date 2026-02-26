import type { RecoveryPlanWindow } from './incident-models';
import {
  createHubAdapter,
  createRouteEnvelope,
  runAdapterBySignal,
  type HubCatalogInput,
  type HubCatalogLookup,
  type RouteFacet,
} from '@shared/type-level-hub';
import { z } from 'zod';

type SeedCatalog = {
  readonly continuity: '/continuity/plan/route';
  readonly timeline: '/timeline/simulate/plan';
  readonly command: '/command/dispatch/graph';
  readonly policy: '/policy/resolve/rules';
};

export type MeshWorkspaceId = string & { readonly __brand: 'MeshWorkspaceId' };
export type MeshCatalogRow<T extends string> = {
  readonly route: T;
  readonly domain: string;
  readonly severity: number;
};

export type WorkspaceEnvelope = {
  readonly id: MeshWorkspaceId;
  readonly scope: string;
  readonly routes: readonly RouteFacet[];
  readonly rows: readonly MeshCatalogRow<string>[];
};

export type MeshPlannerOutput<TState extends ReadonlyArray<RecoveryPlanWindow>> = {
  readonly state: TState;
  readonly envelope: HubCatalogInput;
  readonly routeLines: ReadonlyArray<string>;
};

const seedCatalog = {
  continuity: '/continuity/plan/route',
  timeline: '/timeline/simulate/plan',
  command: '/command/dispatch/graph',
  policy: '/policy/resolve/rules',
} as const satisfies SeedCatalog;

const seededCatalog = createRouteEnvelope(seedCatalog);

const adapter = createHubAdapter(
  'mesh-stress-adapter',
  'dispatch',
  async ({ verb, input }) => {
    await z.object({ verb: z.string() }).parseAsync({ verb: verb as string });
    return {
      verb,
      payload: input,
    };
  },
);

export const buildWorkspaceEnvelope = (
  tenant: string,
  scope: string,
  routes: HubCatalogInput,
): WorkspaceEnvelope => {
  const envelope = createRouteEnvelope(routes);
  const rows = Object.entries(routes).map(([routeScope, route]) => ({
    route: route as string,
    domain: routeScope,
    severity: Math.max(1, route.length % 5),
  }));
  return {
    id: `${tenant}:${scope}` as MeshWorkspaceId,
    scope,
    routes: envelope.projection.map((entry) => `${entry.scope}:${entry.route}` as RouteFacet),
    rows: rows as readonly MeshCatalogRow<string>[],
  };
};

export const meshWorkspaceSchema = z.object({
  id: z.string(),
  scope: z.string(),
  routes: z.array(z.string()),
});

export const buildPlannerOutput = <const TWindows extends readonly RecoveryPlanWindow[]>(
  tenant: string,
  windows: TWindows,
): MeshPlannerOutput<TWindows> => {
  return {
    state: windows,
    envelope: seedCatalog,
    routeLines: windows.map((window) => `${tenant}:${window.startMinute}->${window.endMinute}:${window.riskScore}`),
  };
};

export type WorkspaceLookup = HubCatalogLookup<typeof seedCatalog, keyof typeof seedCatalog>;

export const routeCatalogForScope = (scope: string): WorkspaceLookup => {
  return seededCatalog.projection.find((entry) => entry.scope === scope) as WorkspaceLookup;
};

export const withFusion = <const T extends HubCatalogInput>(catalog: T, route: keyof T & string) => {
  return createRouteEnvelope({
    ...catalog,
    [`${route}_stress`]: `/${route}/mesh/stress`,
  } as HubCatalogInput);
};

export const runAdapter = async (
  routes: HubCatalogInput,
  signal: keyof HubCatalogInput & string,
): Promise<RouteFacet | undefined> => {
  const result = await runAdapterBySignal(
    {
      id: 'mesh-runner',
      adapters: [adapter as never],
    } as never,
    '/dispatch' as never,
    {
      verb: '/dispatch',
      input: {
        routes,
        signal,
      },
    } as never,
  );

  if (!result.ok) {
    return undefined;
  }

  const firstKey = Object.keys(routes)[0];
  return firstKey as RouteFacet;
};

export type RouteProfile = {
  readonly domain: string;
  readonly action: string;
  readonly resource: string;
};

export type WorkspaceRoutingProfile = Record<keyof HubCatalogInput & string, RouteProfile>;
