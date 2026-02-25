import { z } from 'zod';
import {
  bootstrapSchema,
  phaseOrder,
  recoveryCatalog,
  type WorkbenchBootstrapConfig,
  type WorkbenchCatalog,
  type WorkbenchRunInput,
  workbenchCatalog,
} from '@domain/recovery-workbench-models';
import { makeRunId, makeTenantId, makeWorkspaceId, type WorkbenchTenantId, type WorkbenchWorkspaceId } from '@domain/recovery-workbench-models';

type Catalog = {
  readonly tenant: string;
  readonly workspace: string;
  readonly defaultRoutes: readonly string[];
  readonly pluginNameTuples: readonly string[];
};

type BootstrapConfigProfile = {
  readonly profile: string;
  readonly enabled: boolean;
  readonly revision: number;
};

const defaultProfile: BootstrapConfigProfile = {
  profile: 'default',
  enabled: true,
  revision: 1,
};

const configSource = {
  tenant: String(recoveryCatalog.tenant),
  workspace: 'workbench',
  catalog: {
    tenant: String(recoveryCatalog.tenant),
    workspace: String(recoveryCatalog.workspace),
    defaultRoutes: recoveryCatalog.defaultRoutes,
    pluginNameTuples: ['signal-collector', 'risk-scorer', 'policy-publisher'],
  } satisfies Catalog,
  profile: defaultProfile,
};

const runtimeBootstrapSchema = z.object({
  tenant: z.string(),
  workspace: z.string(),
  catalog: z.object({
    tenant: z.string(),
    workspace: z.string(),
    defaultRoutes: z.array(z.string()).min(1),
    pluginNameTuples: z.array(z.string()),
  }),
  profile: z.object({
    profile: z.string(),
    enabled: z.boolean(),
    revision: z.number(),
  }),
});

type RuntimeBootstrapConfig = z.infer<typeof runtimeBootstrapSchema>;

const bootstrapPayload = runtimeBootstrapSchema.parse(configSource);

export interface RecoveryWorkbenchBootstrap {
  readonly tenantId: WorkbenchTenantId;
  readonly workspaceId: WorkbenchWorkspaceId;
  readonly catalog: WorkbenchCatalog;
  readonly profile: BootstrapConfigProfile;
  readonly config: WorkbenchBootstrapConfig;
}

export const bootstrap: RecoveryWorkbenchBootstrap = {
  tenantId: makeTenantId(bootstrapPayload.tenant),
  workspaceId: makeWorkspaceId(bootstrapPayload.tenant, bootstrapPayload.workspace),
  catalog: workbenchCatalog(bootstrapPayload.tenant, bootstrapPayload.workspace),
  profile: bootstrapPayload.profile,
  config: {
    tenant: bootstrapPayload.tenant,
    workspace: bootstrapPayload.workspace,
    defaultRoutes: [...bootstrapPayload.catalog.defaultRoutes],
    plugins: bootstrapPayload.catalog.pluginNameTuples.map((plugin) => ({
      pluginName: plugin,
      route: phaseOrder[0],
      routeId: `route:${phaseOrder[0]}`,
      confidence: 1,
      dependencies: [],
      tags: {},
    })),
  },
};

export const bootstrapRunId = makeRunId(
  bootstrapPayload.tenant,
  bootstrapPayload.workspace,
  bootstrapPayload.profile.profile,
);

export const isDefaultProfileEnabled = (): boolean => bootstrap.profile.enabled;
