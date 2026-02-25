import {
  bootstrapStudioConductor,
  runStudioScenario as runStudioScenarioWithConductor,
  type PluginId,
  type StudioManifestCatalog,
  type StudioRunOutput,
  type StudioRunInput,
  type StudioPluginDefinition,
  resolveWorkspaceManifest,
  resolveTenantManifest,
  parseWorkspaceId,
  parseTenantId,
  type TenantId,
  type WorkspaceId,
} from '@shared/cockpit-studio-core';

export type StudioScenarioInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scenarioId: string;
  readonly payload: Record<string, unknown>;
};

export type StudioPageMode = 'idle' | 'building' | 'draining' | 'ready' | 'running' | 'saturated' | 'error';

export type StudioManifestWindow = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly pluginCount: number;
  readonly pluginIds: readonly PluginId[];
  readonly stageWeights: Readonly<Record<string, number>>;
};

export type StudioRuntimeSummary = {
  readonly runId: string;
  readonly ok: boolean;
  readonly score: number;
  readonly eventCount: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly graph: readonly PluginId[];
  readonly payloadKeys: readonly string[];
};

export type StudioRunFacade = {
  readonly runId: string;
  readonly output: StudioRunOutput;
  readonly summary: StudioRuntimeSummary;
};

const toSummary = (run: StudioRunOutput): StudioRuntimeSummary => ({
  runId: run.runId,
  ok: run.ok,
  score: run.result.score,
  eventCount: run.events.length,
  startedAt: run.snapshot.startedAt,
  completedAt: run.snapshot.completedAt ?? run.snapshot.startedAt,
  graph: run.graph,
  payloadKeys: Object.keys((run.result.data ?? {}) as Record<string, unknown>),
});

const hydrateSummary = (run: StudioRunOutput): StudioRunFacade => ({
  runId: run.runId,
  output: run,
  summary: toSummary(run),
});

export const parseWorkspace = (value: string): WorkspaceId => parseWorkspaceId(value);

export const parseTenant = (value: string): TenantId => parseTenantId(value);

export const toManifestWindow = (manifest: StudioManifestCatalog): StudioManifestWindow => ({
  tenantId: manifest.tenantId,
  workspaceId: manifest.workspaceId,
  pluginCount: manifest.pluginCatalog.length,
  pluginIds: manifest.pluginCatalog.map((entry) => entry.id),
  stageWeights: manifest.pluginCatalog.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
    return acc;
  }, {}),
});

export const normalizeScenarioPayload = (input: StudioScenarioInput): StudioRunInput => ({
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  scenarioId: `scenario::${input.scenarioId}`,
  payload: input.payload,
});

export const listManifestPlugins = async (tenantId: string, workspaceId: string): Promise<StudioManifestWindow[]> => {
  const manifest = resolveWorkspaceManifest(tenantId, workspaceId) ?? resolveTenantManifest(tenantId);
  if (!manifest) {
    return [];
  }
  return [toManifestWindow(manifest)];
};

export const composeStudioInputDigest = (input: StudioScenarioInput): string =>
  `tenant:${input.tenantId}|workspace:${input.workspaceId}|scenario:${input.scenarioId}|keys:${Object.keys(input.payload).sort().join(',')}`;

export const runStudioScenario = async (
  tenantId: string,
  workspaceId: string,
  scenarioId: string,
  payload: Record<string, unknown>,
): Promise<StudioRunFacade> => hydrateSummary(await runStudioScenarioWithConductor(tenantId, workspaceId, scenarioId, payload));

export const buildStudioRunMatrix = <TPlugins extends readonly StudioPluginDefinition[]>(
  plugins: TPlugins,
): Record<string, PluginId[]> => {
  const buckets = {} as Record<string, PluginId[]>;
  for (const plugin of plugins) {
    const key = `${plugin.kind}-${plugin.version}`;
    const existing = buckets[key] ?? [];
    existing.push(plugin.id);
    buckets[key] = existing;
  }
  return buckets;
};

export const preloadManifest = async (
  tenantId: string,
  workspaceId: string,
): Promise<StudioManifestCatalog> => {
  const manifest = resolveWorkspaceManifest(tenantId, workspaceId) ?? resolveTenantManifest(tenantId);
  if (manifest) {
    return manifest;
  }
  const conductor = await bootstrapStudioConductor(tenantId, workspaceId);
  return conductor.manifest;
};
