import { z } from 'zod';
import type { NoInfer, PrefixTupleValues, KeyByPrefix, PluginRoute, PluginSignal } from '@shared/recovery-workbench-runtime';
import { makeRunId, type WorkbenchRunId, type WorkbenchTenantId, type WorkbenchWorkspaceId } from './ids';
import { makePluginId, type WorkbenchPluginId } from './ids';

export type WorkbenchPhase = 'ingest' | 'transform' | 'score' | 'publish';

export type WorkbenchRoute = PluginRoute;

export type WorkbenchMetadataValue = string | number | boolean | null;

export interface WorkbenchContext {
  readonly tenantId: WorkbenchTenantId;
  readonly workspaceId: WorkbenchWorkspaceId;
  readonly runId: WorkbenchRunId;
  readonly startedAt: string;
}

export interface WorkbenchSignal {
  readonly route: WorkbenchRoute;
  readonly values: Readonly<Record<string, number>>;
  readonly tags: Readonly<Record<string, string>>;
}

export type RoutePath<T extends readonly WorkbenchPhase[]> = PrefixTupleValues<'route', T>;

export interface WorkbenchCatalogSeed {
  readonly tenant: string;
  readonly workspace: string;
  readonly defaultRoutes: readonly WorkbenchRoute[];
  readonly pluginNameTuples: readonly string[];
}

export interface WorkbenchRunInput {
  readonly tenantId: WorkbenchTenantId;
  readonly workspaceId: WorkbenchWorkspaceId;
  readonly phases: readonly WorkbenchPhase[];
  readonly routes: readonly WorkbenchRoute[];
  readonly requestedBy: string;
  readonly metadata: WorkbenchMetadata;
}

export type WorkbenchMetadata = NoInfer<Readonly<Record<string, WorkbenchMetadataValue>>>;

export type WorkbenchMetadataLabels = KeyByPrefix<WorkbenchMetadata, 'meta'>;

export interface WorkbenchPluginSeed {
  readonly pluginName: string;
  readonly route: WorkbenchPhase;
  readonly routeId: WorkbenchRoute;
  readonly confidence: number;
  readonly dependencies: readonly WorkbenchPluginId[];
  readonly tags: Readonly<Record<string, string>>;
}

export interface WorkbenchCatalog {
  readonly tenant: WorkbenchTenantId;
  readonly workspace: WorkbenchWorkspaceId;
  readonly defaultRoutes: readonly WorkbenchRoute[];
  readonly plugins: readonly WorkbenchPluginSeed[];
}

export interface WorkbenchPluginTrace {
  readonly pluginId: WorkbenchPluginId;
  readonly pluginName: string;
  readonly route: WorkbenchRoute;
  readonly output: string;
  readonly latencyMs: number;
  readonly phase: WorkbenchPhase;
  readonly confidence: number;
}

export interface WorkbenchRunOutput {
  readonly tenantId: WorkbenchTenantId;
  readonly workspaceId: WorkbenchWorkspaceId;
  readonly runId: WorkbenchRunId;
  readonly routeMatrix: Readonly<Record<WorkbenchRoute, readonly string[]>>;
  readonly timeline: readonly string[];
  readonly traces: readonly WorkbenchPluginTrace[];
  readonly totalDurationMs: number;
}

export const phaseOrder = ['ingest', 'transform', 'score', 'publish'] as const satisfies readonly WorkbenchPhase[];

const routeSchema = z.string().refine((candidate: string) => candidate.startsWith('route:'), 'invalid route format');
const pluginSchema = z.string().min(3);
const tenantSchema = z.string().min(3);
const workspaceSchema = z.string().min(3);

export const bootstrapSchema = z.object({
  tenant: tenantSchema,
  workspace: workspaceSchema,
  defaultRoutes: z.array(routeSchema).min(1),
  plugins: z
    .array(
      z.object({
        pluginName: pluginSchema,
        route: routeSchema,
        routeId: routeSchema,
        confidence: z.number().min(0).max(1),
        dependencies: z.array(z.string()),
        tags: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
});

export type WorkbenchBootstrapConfig = z.infer<typeof bootstrapSchema>;

export const makeWorkspaceContext = (tenant: string, workspace: string): WorkbenchContext => {
  const tenantId = tenantSchema.parse(tenant) as WorkbenchTenantId;
  const workspaceId = workspaceSchema.parse(workspace) as WorkbenchWorkspaceId;
  return {
    tenantId,
    workspaceId,
    runId: makeRunId(tenant, workspace, `ctx-${Date.now()}`),
    startedAt: new Date().toISOString(),
  };
};

export const normalizeRunInput = (input: WorkbenchRunInput): WorkbenchRunInput => {
  const normalizedPhases = input.phases.length > 0 ? input.phases : phaseOrder;
  const routes = (normalizedPhases.length > 0 ? normalizedPhases : phaseOrder).map((phase) => `route:${phase}` as WorkbenchRoute);
  const metadata = {
    ...input.metadata,
    normalizedAt: new Date().toISOString(),
    normalizedBy: 'normalizeRunInput',
  } as WorkbenchMetadata;

  return {
    ...input,
    phases: [...normalizedPhases],
    routes,
    metadata,
  };
};

export const inferTenantFromSignal = (signal: PluginSignal): WorkbenchTenantId => signal.tenantId as WorkbenchTenantId;

export const recoveryBootstrapConfig = bootstrapSchema;

export const pluginSeedFromNames = (tenant: string, workspace: string): readonly WorkbenchPluginSeed[] => {
  return [
    {
      pluginName: 'signal-collector',
      route: 'ingest',
      routeId: 'route:ingest',
      confidence: 0.99,
      dependencies: [],
      tags: {
        tenant,
        workspace,
      },
    },
    {
      pluginName: 'risk-scorer',
      route: 'score',
      routeId: 'route:score',
      confidence: 0.88,
      dependencies: [makePluginId(tenant, 'signal-collector')],
      tags: {
        tenant,
        workspace,
      },
    },
    {
      pluginName: 'policy-publisher',
      route: 'publish',
      routeId: 'route:publish',
      confidence: 0.97,
      dependencies: [makePluginId(tenant, 'risk-scorer')],
      tags: {
        tenant,
        workspace,
      },
    },
  ];
};
