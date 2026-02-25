import { enrichManifestDefaults, readManifestSummary, manifestToBlueprint } from './manifest';
import {
  asLabOperator,
  asLabWorkspaceId,
  buildRunId,
  buildBlueprintId,
  type ControlLabBlueprint,
  defaultDomains,
  defaultVerbs,
} from './types';

interface BootConfig {
  readonly environment: 'development' | 'staging' | 'production';
  readonly defaultBlueprintId: ReturnType<typeof buildBlueprintId>;
  readonly defaultRunId: ReturnType<typeof buildRunId>;
  readonly defaultDomains: readonly string[];
  readonly defaultVerbs: readonly string[];
  readonly summary: ReturnType<typeof readManifestSummary>;
  readonly blueprint: ReturnType<typeof manifestToBlueprint>;
}

const environment = (): BootConfig['environment'] => {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    return 'production';
  }
  if (nodeEnv === 'staging') {
    return 'staging';
  }
  return 'development';
};

const bootstrapSeed = (): BootConfig => {
  const manifest = enrichManifestDefaults({
    tenantId: 'global',
    workspaceId: 'lab-console',
    operator: 'bootstrap',
    signalClasses: [...defaultDomains],
    stageOrder: [...defaultVerbs],
  });

  return {
    environment: environment(),
    defaultBlueprintId: buildBlueprintId(manifest.tenantId, manifest.workspaceId),
    defaultRunId: buildRunId(manifest.tenantId, manifest.workspaceId),
    defaultDomains,
    defaultVerbs,
    summary: readManifestSummary(manifest),
    blueprint: manifestToBlueprint(manifest),
  };
};

let cached: BootConfig | undefined;

export const bootstrapConfig = async (): Promise<BootConfig> => {
  return cached ??= bootstrapSeed();
};

export const createRuntimeBlueprint = (): Omit<ControlLabBlueprint, 'blueprintId' | 'tenantId' | 'startedAt'> => ({
  workspaceId: asLabWorkspaceId('lab-console'),
  signalClasses: [...defaultDomains],
  stageOrder: [...defaultVerbs],
  operator: asLabOperator('system'),
  pluginKinds: ['telemetry', 'planner', 'simulator', 'advice', 'observer'],
});
