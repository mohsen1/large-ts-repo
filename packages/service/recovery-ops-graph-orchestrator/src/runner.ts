import {
  createEngine,
  type RuntimeResult,
  type OrchestratorInput,
  type OrchestratorHints,
  type AnyGraphPlugin,
  type ProfileId,
  type RecoveryGraphEvent,
  formatISO,
  type WorkflowId,
  type TenantId,
  type IncidentId,
  type RunId,
} from '@domain/recovery-ops-orchestration-graph';
import { withBrand } from '@shared/core';
import {
  createHints,
  buildWorkspacePlan,
  toOrchestratorInput,
  type PlannerInput,
  type PlannerPlugin,
} from './plan';
import { getProfile } from './runtime-config';

export interface GraphOrchestratorContext {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly incidentId: string;
  readonly profileId: ProfileId;
}

interface Telemetry {
  add(event: RecoveryGraphEvent): void;
  snapshot(): readonly RecoveryGraphEvent[];
}

const createTelemetry = (): Telemetry => {
  const events: RecoveryGraphEvent[] = [];
  return {
    add(event) {
      events.push(event);
    },
    snapshot() {
      return events.slice();
    },
  };
};

const normalizeHints = (input: OrchestratorHints): OrchestratorHints => ({
  dryRun: input.dryRun,
  trace: input.trace,
  timeoutMs: Math.max(100, input.timeoutMs),
  parallelism: input.parallelism,
});

export async function runWorkspaceOrchestration<TPlugins extends readonly AnyGraphPlugin[]>(
  plugins: TPlugins,
  input: OrchestratorInput,
  options?: Partial<OrchestratorHints>,
): Promise<RuntimeResult<TPlugins>> {
  const profile = getProfile(input.profile.profileId);
  const hints = normalizeHints({
    ...createHints(profile),
    ...options,
  });

  const telemetry = createTelemetry();
  telemetry.add({
    stage: 'ingest',
    name: 'graph:orchestration:start',
    payload: {
      profile: profile.profileName,
      stage: 'start',
    },
    timestamp: formatISO(new Date()),
  });

  const engine = createEngine(plugins, hints);
  const result = await engine.run({
    ...input,
    requestedPlugins: [...input.requestedPlugins],
    limit: Math.max(1, input.limit),
    allowParallel: hints.parallelism > 1,
    profile,
  });

  telemetry.add({
    stage: 'execute',
    name: 'graph:orchestration:finish',
    payload: {
      outputKeys: Object.keys(result.pluginOutputs),
      workspaceId: result.workspaceId,
    },
    timestamp: formatISO(new Date()),
  });

  return {
    ...result,
    diagnostics: [...telemetry.snapshot(), ...result.diagnostics],
  };
}

export async function planAndRun<TPlugins extends readonly PlannerPlugin[]>(
  context: GraphOrchestratorContext,
  plugins: TPlugins,
  selectedProfile: string,
): Promise<RuntimeResult<TPlugins>> {
  const input: PlannerInput<TPlugins> = {
    workspaceId: context.workspaceId,
    tenantId: context.tenantId,
    incidentId: context.incidentId,
    availablePlugins: plugins,
    selectedProfileId: selectedProfile,
    hardCap: Math.max(1, plugins.length),
  };

  const plan = buildWorkspacePlan(input);
  const orchestratorInput = toOrchestratorInput(input, plan, plan.profile);
  const selected = (plan.selection.length ? plan.selection : plugins) as TPlugins;

  return runWorkspaceOrchestration(selected, orchestratorInput, {
    parallelism: selected.length > 2 ? 4 : 2,
    timeoutMs: plan.profile.strictness * 777,
    trace: true,
    dryRun: false,
  });
}

export interface OrchestratorRunner<TPlugins extends readonly AnyGraphPlugin[]> {
  runWorkspace(
    context: GraphOrchestratorContext,
    profileId: string,
    plugins: TPlugins,
  ): Promise<RuntimeResult<TPlugins>>;
}

export const createOrchestratorRunner = <TPlugins extends readonly AnyGraphPlugin[]>(): OrchestratorRunner<TPlugins> => ({
  runWorkspace: async (context, profileId, plugins) => {
    const input: OrchestratorInput = {
      workflow: {
        id: withBrand(`${context.workspaceId}:run`, 'WorkflowId') as WorkflowId,
        tenantId: withBrand(context.tenantId, 'TenantId') as TenantId,
        incidentId: withBrand(context.incidentId, 'IncidentId') as IncidentId,
        runId: withBrand(`${context.workspaceId}:run:${Date.now()}`, 'RunId') as RunId,
        graphLabel: `${context.tenantId}:${context.incidentId}`,
        stages: ['ingest', 'plan', 'simulate', 'execute', 'observe', 'finalize'],
        targetWindowMinutes: 15,
        tags: ['runner', profileId],
        signals: [],
      },
      requestedPlugins: plugins.map((plugin) => plugin.id),
      limit: Math.max(1, plugins.length),
      allowParallel: plugins.length > 2,
      profile: getProfile(profileId),
    };

    return runWorkspaceOrchestration(plugins, input, {
      parallelism: profileId.includes('latency') ? 4 : 2,
      dryRun: false,
      trace: true,
      timeoutMs: 2000,
    });
  },
});

export { createEngine as createGraphEngine };
