import {
  makeTenantId,
  makeWorkspaceId,
  type WorkbenchPluginId,
  type WorkbenchTenantId,
  type WorkbenchWorkspaceId,
} from './ids';
import type {
  WorkbenchCatalog,
  WorkbenchCatalogSeed,
  WorkbenchPluginSeed,
  WorkbenchPluginTrace,
  WorkbenchRoute,
} from './models';
import {
  WorkbenchPluginDescriptor,
  type WorkbenchPluginContext,
  makePluginId,
} from '@shared/recovery-workbench-runtime';
import { pluginSeedFromNames, type WorkbenchPhase, type WorkbenchRunOutput } from './models';

type RuntimeRoute = `route:${WorkbenchPhase}`;
type WorkbenchRuntimePayload = { readonly payload: string; readonly trace: string };
type WorkbenchRuntimeResult = { readonly payload: string; readonly score: number; readonly source: string };

export type WorkbenchRuntimeDescriptor =
  | WorkbenchPluginDescriptor<string, WorkbenchRuntimePayload, WorkbenchRuntimeResult, 'route:ingest'>
  | WorkbenchPluginDescriptor<string, WorkbenchRuntimePayload, WorkbenchRuntimeResult, 'route:transform'>
  | WorkbenchPluginDescriptor<string, WorkbenchRuntimePayload, WorkbenchRuntimeResult, 'route:score'>
  | WorkbenchPluginDescriptor<string, WorkbenchRuntimePayload, WorkbenchRuntimeResult, 'route:publish'>;

interface WorkbenchCatalogLookupContext {
  readonly tenant: WorkbenchTenantId;
  readonly workspace: WorkbenchWorkspaceId;
}

export const recoveryBootstrapSeed = {
  tenant: 'recovery',
  workspace: 'workbench',
  defaultRoutes: ['route:ingest', 'route:score', 'route:publish'] as const,
  pluginNameTuples: ['signal-collector', 'risk-scorer', 'policy-publisher'] as const,
} as const satisfies WorkbenchCatalogSeed;

export const workbenchCatalog = (tenant: string, workspace: string): WorkbenchCatalog => {
  const tenantId = makeTenantId(tenant);
  const workspaceId = makeWorkspaceId(tenant, workspace);
  const plugins = pluginSeedFromNames(tenant, workspace).map((seed) => ({
    ...seed,
    routeId: seed.routeId,
  }));

  return {
    tenant: tenantId,
    workspace: workspaceId,
    defaultRoutes: ['route:ingest', 'route:score', 'route:publish'],
    plugins,
  } satisfies WorkbenchCatalog;
};

export const recoveryCatalog: WorkbenchCatalog = workbenchCatalog('recovery', 'workbench');

const buildDescriptorInput = (seed: WorkbenchPluginSeed, tenant: string): string =>
  `${tenant}::${seed.pluginName}::${seed.route}`;

const buildDescriptorOutput = (seed: WorkbenchPluginSeed, context: WorkbenchPluginContext<WorkbenchRoute>): string =>
  `${seed.pluginName}::${context.route}::${seed.confidence}`;

const kindFromRoute = (route: RuntimeRoute): WorkbenchRuntimeDescriptor['kind'] => {
  if (route === 'route:ingest') return 'ingest';
  if (route === 'route:score') return 'score';
  if (route === 'route:publish') return 'publish';
  return 'transform';
};

const normalizeSeed = (seed: WorkbenchPluginSeed, context: WorkbenchCatalogLookupContext): WorkbenchRuntimeDescriptor => {
  const pluginId = makePluginId(context.tenant, seed.pluginName);
  const buildInput = {
    payload: buildDescriptorInput(seed, String(context.tenant)),
    traceBase: seed.pluginName,
  };

  if (seed.route === 'ingest') {
    return {
      pluginId,
      pluginName: seed.pluginName,
      route: 'route:ingest',
      kind: kindFromRoute('route:ingest'),
      dependencies: [...seed.dependencies] as readonly WorkbenchPluginId[],
      canRun: (_context, _signal) => _context.route === 'route:ingest' && seed.confidence > 0,
      input: {
        payload: buildInput.payload,
        trace: `route:ingest:${seed.pluginName}`,
      },
      run: async (input, _context) => {
        return {
          payload: `${buildDescriptorOutput(seed, _context)}::${input.payload}::${input.trace}`,
          score: Math.max(0, Math.min(1, seed.confidence * 100)),
          source: _context.tenantId as string,
        };
      },
    };
  }

  if (seed.route === 'transform') {
    return {
      pluginId,
      pluginName: seed.pluginName,
      route: 'route:transform',
      kind: kindFromRoute('route:transform'),
      dependencies: [...seed.dependencies] as readonly WorkbenchPluginId[],
      canRun: (_context, _signal) => _context.route === 'route:transform' && seed.confidence > 0,
      input: {
        payload: buildInput.payload,
        trace: `route:transform:${seed.pluginName}`,
      },
      run: async (input, _context) => {
        return {
          payload: `${buildDescriptorOutput(seed, _context)}::${input.payload}::${input.trace}`,
          score: Math.max(0, Math.min(1, seed.confidence * 100)),
          source: _context.tenantId as string,
        };
      },
    };
  }

  if (seed.route === 'score') {
    return {
      pluginId,
      pluginName: seed.pluginName,
      route: 'route:score',
      kind: kindFromRoute('route:score'),
      dependencies: [...seed.dependencies] as readonly WorkbenchPluginId[],
      canRun: (_context, _signal) => _context.route === 'route:score' && seed.confidence > 0,
      input: {
        payload: buildInput.payload,
        trace: `route:score:${seed.pluginName}`,
      },
      run: async (input, _context) => {
        const score = Math.max(0, Math.min(1, seed.confidence * 100));
        return {
          payload: `${buildDescriptorOutput(seed, _context)}::${input.payload}::${input.trace}`,
          score,
          source: _context.tenantId as string,
        };
      },
    };
  }

  return {
    pluginId,
    pluginName: seed.pluginName,
    route: 'route:publish',
    kind: kindFromRoute('route:publish'),
    dependencies: [...seed.dependencies] as readonly WorkbenchPluginId[],
    canRun: (_context, _signal) => _context.route === 'route:publish' && seed.confidence > 0,
      input: {
      payload: buildInput.payload,
      trace: `route:publish:${seed.pluginName}`,
    },
    run: async (input, _context) => {
      const score = Math.max(0, Math.min(1, seed.confidence * 100));
      return {
        payload: `${buildDescriptorOutput(seed, _context)}::${input.payload}::${input.trace}`,
        score,
        source: _context.tenantId as string,
      };
    },
  };
};

export const recoveryCatalogDescriptors = (tenantId: WorkbenchTenantId = makeTenantId('recovery')): readonly WorkbenchRuntimeDescriptor[] => {
  const { tenant, workspace } = {
    tenant: String(tenantId).replace('tenant:', ''),
    workspace: 'workbench',
  };
  return recoveryCatalogFromSeed(workbenchCatalog(tenant, workspace), tenantId, workbenchCatalog(tenant, workspace).plugins, [
    'route:ingest',
    'route:score',
    'route:publish',
  ]).toDescriptors();
};

export const recoveryCatalogFromSeed = (
  catalog: WorkbenchCatalog,
  tenant: WorkbenchTenantId,
  pluginSeeds: readonly WorkbenchPluginSeed[] = catalog.plugins,
  routes: readonly WorkbenchRoute[] = catalog.defaultRoutes,
): {
  readonly catalog: WorkbenchCatalog;
  readonly routes: readonly WorkbenchRoute[];
  readonly toDescriptors: () => readonly WorkbenchRuntimeDescriptor[];
} => {
  const context: WorkbenchCatalogLookupContext = {
    tenant,
    workspace: catalog.workspace,
  };

  return {
    catalog,
    routes,
    toDescriptors: () =>
      pluginSeeds
        .filter((seed) => routes.includes(seed.routeId as WorkbenchRoute))
        .map((seed) => normalizeSeed(seed, context)),
  };
};

export interface CatalogRouteGroup {
  readonly route: WorkbenchRoute;
  readonly pluginCount: number;
}

export const groupedRoutes = (catalog: WorkbenchCatalog): readonly CatalogRouteGroup[] => {
  const counts = new Map<WorkbenchRoute, number>();

  for (const plugin of catalog.plugins) {
    const route = plugin.routeId as WorkbenchRoute;
    counts.set(route, (counts.get(route) ?? 0) + 1);
  }

  return [...counts.entries()].map(([route, pluginCount]) => ({ route, pluginCount }));
};

export const mapByRoute = (catalog: WorkbenchCatalog): Record<WorkbenchRoute, readonly WorkbenchRuntimeDescriptor['pluginName'][]> => {
  return catalog.plugins.reduce((accumulator, plugin) => {
    const route = plugin.routeId as WorkbenchRoute;
    const current = accumulator[route] ?? [];
    accumulator[route] = [...current, plugin.pluginName];
    return accumulator;
  }, {} as Record<WorkbenchRoute, readonly WorkbenchRuntimeDescriptor['pluginName'][]>);
};

export const makeRouteMatrix = (seed: WorkbenchCatalog): Record<WorkbenchRoute, readonly string[]> => {
  const matrix = {} as Record<WorkbenchRoute, readonly string[]>;
  for (const route of seed.defaultRoutes) {
    matrix[route] = [];
  }
  for (const plugin of seed.plugins) {
    const route = plugin.routeId as WorkbenchRoute;
    matrix[route] = [...(matrix[route] ?? []), plugin.pluginName];
  }
  return matrix;
};

export const recoverTraceLines = (catalog: WorkbenchCatalog, traces: readonly WorkbenchPluginTrace[]): readonly string[] => {
  return traces.map((trace) => `${trace.route}:${trace.pluginName}:${trace.output}`);
};
