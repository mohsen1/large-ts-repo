import { withBrand } from '@shared/core';
import { createEngine, type RuntimeResult } from '@domain/recovery-ops-orchestration-graph';
import type {
  AnyGraphPlugin,
  IncidentId,
  OrchestratorInput,
  OrchestratorHints,
  PluginId,
  ProfileHint,
  RunId,
  TenantId,
  WorkflowId,
} from '@domain/recovery-ops-orchestration-graph';
import { getProfile } from './runtime-config';

export type PlannerPlugin = AnyGraphPlugin;

export interface PlannerInput<TPlugins extends readonly PlannerPlugin[]> {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly incidentId: string;
  readonly availablePlugins: TPlugins;
  readonly selectedProfileId: string;
  readonly hardCap: number;
}

export interface PlannerOutput<TPlugins extends readonly PlannerPlugin[]> {
  readonly pluginIds: readonly PluginId[];
  readonly selection: readonly TPlugins[number][];
  readonly profile: ProfileHint;
  readonly summary: {
    readonly count: number;
    readonly hardCap: number;
    readonly tags: readonly string[];
  };
}

export interface WeightedPlugin<T extends PlannerPlugin> {
  readonly plugin: T;
  readonly weight: number;
}

export const rankPlugins = <TPlugins extends readonly PlannerPlugin[]>(
  plugins: TPlugins,
  profile: ProfileHint,
): readonly WeightedPlugin<TPlugins[number]>[] =>
  plugins
    .map((plugin) => ({
      plugin,
      weight: plugin.name.length * profile.strictness + plugin.dependencies.length,
    }))
    .toSorted((left, right) => right.weight - left.weight);

export const choosePlugins = <TPlugins extends readonly PlannerPlugin[]>(
  ranked: readonly WeightedPlugin<TPlugins[number]>[],
  hardCap: number,
): readonly TPlugins[number][] => {
  const cap = hardCap > 0 ? Math.min(ranked.length, hardCap) : ranked.length;
  return ranked.slice(0, cap).map((entry) => entry.plugin);
};

export const buildWorkspacePlan = <TPlugins extends readonly PlannerPlugin[]>(
  input: PlannerInput<TPlugins>,
): PlannerOutput<TPlugins> => {
  const profile = getProfile(input.selectedProfileId);
  const ranked = rankPlugins(input.availablePlugins, profile);
  const chosen = choosePlugins(ranked, input.hardCap);

  return {
    pluginIds: chosen.map((plugin) => plugin.id),
    selection: [...chosen],
    profile,
    summary: {
      count: chosen.length,
      hardCap: input.hardCap,
      tags: profile.tags,
    },
  };
};

export const toOrchestratorInput = <TPlugins extends readonly PlannerPlugin[]>
  (
    input: PlannerInput<TPlugins>,
    plan: PlannerOutput<TPlugins>,
    profile: ProfileHint,
  ): OrchestratorInput => ({
    workflow: {
      id: withBrand(input.workspaceId, 'WorkflowId') as WorkflowId,
      tenantId: withBrand(input.tenantId, 'TenantId') as TenantId,
      incidentId: withBrand(input.incidentId, 'IncidentId') as IncidentId,
      runId: withBrand(`${input.workspaceId}:run:${Date.now()}`, 'RunId') as RunId,
      graphLabel: `${input.workspaceId}:${input.tenantId}:${input.incidentId}`,
      stages: ['ingest', 'plan', 'simulate', 'execute', 'observe', 'finalize'],
      targetWindowMinutes: 15,
      tags: ['planner', profile.profileName],
      signals: [],
    },
    requestedPlugins: [...plan.pluginIds],
    limit: Math.max(1, plan.selection.length),
    allowParallel: plan.selection.length > 2,
    profile,
  });

export const createHints = (profile: ProfileHint): OrchestratorHints => ({
  dryRun: profile.strictness > 8,
  trace: true,
  timeoutMs: Math.max(1_000, profile.strictness * 120),
  parallelism: profile.strictness >= 8 ? 4 : 2,
});

export const executePlan = async <TPlugins extends readonly PlannerPlugin[]>(
  input: PlannerInput<TPlugins>,
): Promise<RuntimeResult<TPlugins>> => {
  const plan = buildWorkspacePlan(input);
  const orchestratorInput = toOrchestratorInput(input, plan, plan.profile);
  const engine = createEngine(plan.selection as TPlugins, createHints(plan.profile));
  return engine.run(orchestratorInput);
};
