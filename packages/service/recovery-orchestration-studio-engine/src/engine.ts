import {
  chain,
  listManifests,
  PluginRegistry,
  type OrchestrationPlugin,
  type PluginId,
} from '@shared/orchestration-kernel';
import { normalizeLimit, withBrand } from '@shared/core';
import {
  composePlan,
  type PlannerInput,
  adaptRunbook,
  type RecoveryRunbook,
} from '@domain/recovery-orchestration-design';
import { toTick } from './telemetry';
import type {
  EngineConfig,
  EngineExecutionId,
  EngineResult,
  EngineTick,
  EngineWorkload,
  RuntimePhase,
  RuntimeStatus,
} from './types';

const bootstrapConfig: EngineConfig = {
  tenant: withBrand('tenant-studio', 'EngineTenantId'),
  workspace: withBrand('global.workspace', 'EngineWorkspaceId'),
  limitMs: 90_000,
  tags: ['default', 'studio'],
};

type StudioEvent = {
  readonly at: number;
  readonly pluginId: PluginId;
  readonly phase: RuntimePhase;
  readonly status: RuntimeStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
};

const startupManifest: readonly PluginId[] = [
  'recoveryscope:topology',
  'recoveryscope:policy',
  'recoveryscope:mitigate',
  'recoveryscope:resolve',
].map((value) => withBrand(value, 'PluginId'));

const makeManifestEvents = (workspace: EngineConfig['workspace']): readonly StudioEvent[] =>
  startupManifest.map((pluginId, index) => ({
    at: index * 100,
    pluginId,
    phase: (['boot', 'planning', 'execution', 'complete'][index] ?? 'complete') as RuntimePhase,
    status: index === 0 ? 'running' : 'finished',
    metadata: {
      workspace,
      startup: true,
    },
  }));

export interface OrchestrationStudioEngineOptions {
  readonly runbookId: string;
  readonly manifest?: PluginId[];
}

const phaseAlias = (phase: RuntimePhase): `orchestration/${RuntimePhase}` => `orchestration/${phase}`;

export class OrchestrationStudioEngine {
  readonly #config: EngineConfig;
  #registry: PluginRegistry<readonly OrchestrationPlugin[]>;

  constructor(config: EngineConfig = bootstrapConfig) {
    this.#config = config;
    this.#registry = new PluginRegistry([]);
  }

  withConfig(config: Partial<EngineConfig>): OrchestrationStudioEngine {
    return new OrchestrationStudioEngine({
      ...this.#config,
      ...config,
      tenant: config.tenant ?? this.#config.tenant,
      workspace: config.workspace ?? this.#config.workspace,
      limitMs: config.limitMs ?? this.#config.limitMs,
      tags: [...this.#config.tags, ...(config.tags ?? [])],
    });
  }

  async *run(options: { readonly runbook: RecoveryRunbook }): AsyncGenerator<EngineTick, EngineResult, void> {
    const workload: EngineWorkload = {
      workspace: this.#config.workspace,
      planId: withBrand('plan', 'WorkloadPlanId'),
      scenarioId: withBrand('scenario', 'WorkloadScenarioId'),
      requestedAt: new Date().toISOString(),
    };
    const executionId: EngineExecutionId = withBrand(`${workload.workspace}-${Date.now()}`, 'EngineExecutionId');
    const startedAt = new Date().toISOString();
    const ticks: EngineTick[] = [];

    const planInput: PlannerInput = {
      runbook: options.runbook,
      targetPhases: ['discover', 'stabilize', 'mitigate', 'validate', 'document'],
      tagBudget: normalizeLimit(this.#config.limitMs),
    };
    const plan = composePlan(planInput);
    const parsed = adaptRunbook(options.runbook, []);
    const bootstrap = makeManifestEvents(this.#config.workspace);
    for (const event of bootstrap) {
      const tick: EngineTick = toTick({
        at: event.at,
        phase: event.phase,
        status: event.status,
        plugin: event.pluginId,
        details: {
          ...event.metadata,
          planId: plan.planId,
          eventAlias: phaseAlias(event.phase),
          adapterStatus: parsed.ok ? 'ok' : 'error',
        },
      });
      ticks.push(tick);
      yield tick;
    }

    for (const step of chain(plan.orderedSteps).map((step) => step).toArray()) {
      const tick: EngineTick = {
        at: new Date().toISOString(),
        pluginId: withBrand(`recoveryscope:${step}`, 'PluginId'),
        phase: 'execution',
        status: 'running',
        metadata: {
          step,
          workspace: workload.workspace,
        },
      };
      ticks.push(tick);
      yield tick;
    }

    const engineWorkspace: EngineConfig['workspace'] = withBrand(`${options.runbook.workspace}`, 'EngineWorkspaceId');
    for await (const tick of this.runRegistryWithScope(engineWorkspace)) {
      ticks.push(tick);
      yield tick;
    }

    const finishedAt = new Date().toISOString();
    const result: EngineResult = {
      executionId,
      tenant: this.#config.tenant,
      workspace: this.#config.workspace,
      ticks,
      startedAt,
      finishedAt,
    };
    return result;
  }

  async *runRegistryWithScope(workspaceId: EngineConfig['workspace']): AsyncGenerator<EngineTick, void, void> {
    const manifest = listManifests();
    for (const record of manifest) {
      yield {
        at: new Date().toISOString(),
        pluginId: record.id,
        phase: 'observation',
        status: 'finished',
        metadata: {
          workspace: workspaceId,
          manifestNamespace: record.namespace,
          manifestVersion: record.version,
        },
      };
    }
  }
}

export const bootstrapEngine = (config?: Partial<EngineConfig>): OrchestrationStudioEngine =>
  new OrchestrationStudioEngine({ ...bootstrapConfig, ...config });
