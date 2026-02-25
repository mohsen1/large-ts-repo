import { createRegistry, type PluginPlan, collectPlanMap } from './registry';
import { buildRuntimeSignals, type BlueprintInput, toBlueprintId, type BlueprintOutput } from './blueprints';
import { attachAdapters } from './adapters';
import { bootstrapEngine, OrchestrationStudioEngine } from './engine';
import { toTelemetryEnvelope } from './adapters';
import type { EngineTick, RuntimePhase, EngineResult } from './types';
import { toTelemetry, type TelemetryEnvelope } from './telemetry';
import { withBrand } from '@shared/core';
import { runScheduler } from './scheduler';
import type { RecoveryRunbook } from '@domain/recovery-orchestration-design';

export type StudioControllerHandle = {
  readonly start: (runbook: RecoveryRunbook) => Promise<StudioRunState>;
  readonly stop: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly status: () => Promise<StudioControllerStatus>;
};

export interface StudioControllerStatus {
  readonly tenant: string;
  readonly workspace: string;
  readonly sessions: number;
  readonly latestRun: string;
  readonly latestStatus: EngineResult['ticks'][number]['status'];
}

export interface StudioRunState {
  readonly sessionId: string;
  readonly status: 'queued' | 'running' | 'finished' | 'error';
  readonly ticks: readonly EngineTick[];
  readonly telemetry: readonly TelemetryEnvelope[];
  readonly outputs: BlueprintOutput;
}

type ControllerContext = {
  readonly tenant: string;
  readonly workspace: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly registryId: string;
};

const runbookToPlans = (runbook: RecoveryRunbook): PluginPlan<RecoveryRunbook>[] =>
  runbook.nodes.map((_, index) => ({
    id: `plugin:${runbook.scenarioId}-${index}` as const,
    stage: `stage:plan:${index}` as const,
    slot: `slot:${runbook.scenarioId}` as const,
    payload: runbook,
    runbookId: String(runbook.scenarioId),
  }));

const toStatus = (phase: RuntimePhase): StudioRunState['status'] => {
  if (phase === 'complete') {
    return 'finished';
  }
  if (phase === 'boot' || phase === 'planning' || phase === 'execution' || phase === 'observation') {
    return 'running';
  }
  return 'error';
};

export class StudioController {
  readonly #engine: OrchestrationStudioEngine;
  readonly #context: ControllerContext;
  #latestRunId: string | undefined;
  #latestStatus: StudioRunState['status'] = 'queued';
  #telemetry: TelemetryEnvelope[] = [];
  #sessions = 0;

  public constructor(
    private readonly tenant: string,
    private readonly workspace: string,
    private readonly config: { readonly limitMs: number } = { limitMs: 90_000 },
  ) {
    this.#engine = bootstrapEngine({
      tenant: withBrand(tenant, 'EngineTenantId'),
      workspace: withBrand(workspace, 'EngineWorkspaceId'),
      limitMs: config.limitMs,
      tags: ['studio', 'controller'],
    });
    this.#context = {
      tenant,
      workspace,
      runId: `run-${Date.now()}`,
      startedAt: new Date().toISOString(),
      registryId: `registry:${tenant}:${workspace}`,
    };
  }

  public async start(runbook: RecoveryRunbook): Promise<StudioRunState> {
    const plans: readonly PluginPlan<RecoveryRunbook>[] = runbookToPlans(runbook);
    const registry = createRegistry({ tenant: this.tenant, workspace: this.workspace, config: { ...this.config, tenant: withBrand(this.tenant, 'EngineTenantId'), workspace: withBrand(this.workspace, 'EngineWorkspaceId'), tags: ['studio', 'registry'] } }, plans);
    const planMap = collectPlanMap(plans);

    const snapshot = await registry.open();
    void snapshot;

    const adapters = attachAdapters([
      {
        id: `adapter:${runbook.scenarioId}-metrics` as const,
        mode: 'observe',
        namespace: `workspace:${runbook.workspace}`,
        dependsOn: [],
        resolve: async () => {
          const input: BlueprintInput = {
            runbook,
            planId: toBlueprintId(`plan-${runbook.scenarioId}`),
            config: {
              tenant: withBrand(this.tenant, 'EngineTenantId'),
              workspace: withBrand(this.workspace, 'EngineWorkspaceId'),
              limitMs: this.config.limitMs,
              tags: ['studio', 'adapter'],
            },
            signalThreshold: 21,
          };
          const output = await buildRuntimeSignals(input);
          return {
            status: 'attached' as const,
            ticks: runbook.nodes.map((node, index) => ({
              at: new Date(Date.now() + index).toISOString(),
              pluginId: `studio:${node.id}`,
              phase: ['boot', 'planning', 'execution', 'observation', 'complete'][index % 5] as RuntimePhase,
              status: index % 2 === 0 ? 'running' : 'finished',
              metadata: {
                nodeId: node.id,
                phase: node.phase,
                status: 'ok',
              },
            })),
            runId: `adapter:${runbook.scenarioId}:${Date.now()}`,
          };
        },
      },
      {
        id: `adapter:${runbook.scenarioId}-events` as const,
        mode: 'observe',
        namespace: `workspace:${runbook.workspace}`,
        dependsOn: [`adapter:${runbook.scenarioId}-metrics` as const],
        resolve: async () => ({
          status: 'attached',
          ticks: runbook.nodes.map((node, index) => ({
            at: new Date(Date.now() + index + 64).toISOString(),
            pluginId: `studio:event:${node.id}`,
            phase: 'observation',
            status: 'finished',
            metadata: {
              event: node.phase,
              nodeId: node.id,
            },
          })),
          runId: `adapter:${runbook.scenarioId}-events:${Date.now()}`,
        }),
      },
    ], this.workspace, runbook);

    void adapters;

    const iterator = this.#engine.run({ runbook });
    const ticks: EngineTick[] = [];
    for await (const tick of iterator) {
      ticks.push(tick);
      this.#telemetry.push(toTelemetry(tick), toTelemetryEnvelope(tick));
      this.#latestStatus = toStatus(tick.phase);
    }

    const plansSnapshot = await registry.run(runbook.scenarioId, {
      tenant: this.tenant,
      workspace: this.workspace,
    });
    void plansSnapshot;

    const output = await buildRuntimeSignals({
      runbook,
      planId: toBlueprintId(`plan-${runbook.scenarioId}`),
      config: {
        tenant: withBrand(this.tenant, 'EngineTenantId'),
        workspace: withBrand(this.workspace, 'EngineWorkspaceId'),
        limitMs: this.config.limitMs,
        tags: ['studio', 'controller'],
      },
      signalThreshold: Object.keys(planMap).length,
    });

    this.#latestRunId = `${this.#context.runId}:${runbook.scenarioId}`;
    this.#sessions += 1;

    return {
      sessionId: this.#latestRunId,
      status: this.#latestStatus,
      ticks,
      telemetry: this.#telemetry,
      outputs: output,
    };
  }

  public async stop(): Promise<void> {
    await runScheduler(
      {
        workload: {
          workspace: withBrand(this.workspace, 'EngineWorkspaceId'),
          planId: withBrand('stopped', 'WorkloadPlanId'),
          scenarioId: withBrand('stopped', 'WorkloadScenarioId'),
          requestedAt: new Date().toISOString(),
        },
        tags: ['studio', 'stop'],
      },
      (values) => values.join('|'),
    );
    this.#latestStatus = 'error';
  }

  public async close(): Promise<void> {
    await this.stop();
  }

  public async status(): Promise<StudioControllerStatus> {
    return {
      tenant: this.tenant,
      workspace: this.workspace,
      sessions: this.#sessions,
      latestRun: this.#latestRunId ?? 'none',
      latestStatus: this.#latestStatus === 'queued' ? 'idle' : this.#latestStatus === 'running' ? 'running' : 'finished',
    };
  }
}

export const createStudioController = (tenant: string, workspace: string): StudioController =>
  new StudioController(tenant, workspace);

export const summarizeController = async (controller: StudioController): Promise<StudioControllerStatus> =>
  controller.status();

export const createControllerHandle = (tenant: string, workspace: string): StudioControllerHandle => {
  const controller = createStudioController(tenant, workspace);
  return {
    start: (runbook: RecoveryRunbook) => controller.start(runbook),
    stop: () => controller.stop(),
    close: () => controller.close(),
    status: () => controller.status(),
  };
};
