import {
  type PluginId,
  type PluginKind,
  type StudioManifestCatalog,
  parseRunId,
  type StudioRunInput,
  type StudioRunOutput,
  type StudioRunSnapshot,
} from './contracts';
import { StudioDependencyGraph } from './graph';
import { buildRuntimeContext } from './manifest';
import { StudioPluginRegistry, type PluginExecutionEnvelope, type StudioPluginRegistryContext } from './plugin-registry';

type StageState = {
  readonly pluginId: PluginId;
  at: string;
  status: 'queued' | 'running' | 'done' | 'error';
};

type ConductorDiagnostics = {
  readonly runSteps: readonly StageState[];
  readonly pluginOrder: readonly PluginId[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly successRate: number;
};

const markStatus = (states: StageState[], pluginId: PluginId, status: StageState['status']): void => {
  const index = states.findIndex((entry) => entry.pluginId === pluginId);
  if (index === -1) {
    return;
  }
  states[index] = {
    ...states[index],
    status,
    at: new Date().toISOString(),
  };
};

const deriveSummary = (events: readonly StageState[]): ConductorDiagnostics => {
  const pluginOrder = events.map((entry) => entry.pluginId);
  const startedAt = events.at(0)?.at ?? new Date().toISOString();
  const endedAt = events.at(-1)?.at ?? startedAt;
  const done = events.filter((entry) => entry.status === 'done').length;
  return {
    runSteps: events,
    pluginOrder,
    startedAt,
    endedAt,
    successRate: events.length > 0 ? done / events.length : 1,
  };
};

export class StudioConductor {
  readonly #manifest: StudioManifestCatalog;
  readonly #registry: StudioPluginRegistry<StudioManifestCatalog['pluginCatalog']>;
  readonly #graph: StudioDependencyGraph;

  constructor(manifest: StudioManifestCatalog) {
    this.#manifest = manifest;
    this.#registry = new StudioPluginRegistry(manifest.pluginCatalog);
    this.#graph = StudioDependencyGraph.fromDependencies(manifest.pluginCatalog);
  }

  public get pluginIds(): readonly PluginId[] {
    return this.#manifest.pluginIds;
  }

  public get manifest(): StudioManifestCatalog {
    return this.#manifest;
  }

  public async run(input: StudioRunInput): Promise<StudioRunOutput> {
    const runId = parseRunId(`${input.tenantId}::${input.workspaceId}::${input.scenarioId}`);
    const startedAt = new Date().toISOString();
    const ordered = this.#graph.topologicalSort();
    const requested = input.stageLimit?.filter((value): value is PluginKind =>
      ['ingest', 'validate', 'plan', 'simulate', 'execute', 'observe', 'verify', 'finalize'].includes(value),
    );
    const stages = this.#registry.executionOrder(requested);

    const baseContext: StudioPluginRegistryContext = {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      runId,
      at: startedAt,
      metadata: {
        manifestTenant: input.tenantId,
        workspace: input.workspaceId,
      },
      sequence: ordered,
      strict: this.#manifest.spec.strict,
      parallelism: this.#manifest.spec.parallelism,
      traceLevel: this.#manifest.spec.traceLevel,
    };

    const stageStates: StageState[] = ordered
      .filter((pluginId) => stages.includes(pluginId))
      .map((entry) => ({
        pluginId: entry,
        at: startedAt,
        status: 'queued',
      }));

    const registryExecution: PluginExecutionEnvelope = await this.#registry.execute({
      input: {
        scenario: input.scenarioId,
        ...input.payload,
      } as never,
      context: baseContext,
      stages,
      dryRun: false,
    });

    const events = registryExecution.ok ? registryExecution.value.events : [];
    for (const event of events) {
      markStatus(stageStates, event.pluginId, event.kind.includes('error') ? 'error' : 'done');
    }

    const summary = deriveSummary(stageStates);
    const snapshot: StudioRunSnapshot = {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      runId,
      startedAt,
      completedAt: summary.endedAt,
      stages: stageStates.map((entry) => entry.pluginId),
      eventStream: events,
    };

    if (!registryExecution.ok) {
      return {
        runId,
        ok: false,
        events: [],
        result: {
          kind: 'error',
          data: {
            error: registryExecution.error,
            plugin: registryExecution.pluginId,
          },
          score: 0,
        },
        snapshot,
        graph: ordered,
      };
    }

    const payload = registryExecution.value.payload as Record<string, unknown>;

    return {
      runId,
      ok: true,
      events,
      result: {
        kind: typeof payload.kind === 'string' ? (payload.kind as string) : 'result',
        data: {
          ...payload,
          graph: summary.pluginOrder,
          stages: summary.runSteps.map((step) => ({ ...step, at: step.at })),
          successRate: summary.successRate,
        },
        score: typeof payload.score === 'number' ? (payload.score as number) : summary.successRate * 100,
      },
      snapshot,
      graph: ordered,
    };
  }
}

export const bootstrapStudioConductor = async (
  tenantId: string,
  workspaceId: string,
): Promise<StudioConductor> => {
  const runtime = buildRuntimeContext(tenantId, workspaceId);
  return new StudioConductor(runtime);
};

export const runStudioScenario = async (
  tenantId: string,
  workspaceId: string,
  scenarioId: string,
  payload: Record<string, unknown>,
): Promise<StudioRunOutput> => {
  const conductor = await bootstrapStudioConductor(tenantId, workspaceId);
  return conductor.run({
    tenantId: tenantId as never,
    workspaceId: workspaceId as never,
    scenarioId: `scenario::${scenarioId}`,
    payload,
  });
};
