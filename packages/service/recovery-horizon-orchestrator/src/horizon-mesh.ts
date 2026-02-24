import {
  buildTopology,
  resolvePolicy,
  type NetworkBlueprint,
  type NetworkPolicy,
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type HorizonSignal,
  type HorizonPlan,
  type JsonLike,
  horizonBrand,
  type TimeMs,
} from '@domain/recovery-horizon-engine';
import type { NoInfer } from '@shared/type-level';
import {
  createAnalytics,
  HorizonReadResult,
  createRepository,
  type HorizonStoreRecord,
} from '@data/recovery-horizon-store';
import { createSignalAdapter } from './adapterFactory';
import { runWorkflow, type WorkflowMode, type WorkflowReport } from '@infrastructure/recovery-scenario-orchestration-adapters';
import { ok, err, type Result } from '@shared/result';
import type { PluginStage as Stage } from '@domain/recovery-horizon-engine';

type StageWindowMatrix = {
  readonly tenantId: string;
  readonly matrix: Record<Stage, number>;
  readonly total: number;
};

export type MeshMode = WorkflowMode;

export interface MeshContext<TWindow extends readonly PluginStage[]> {
  readonly tenantId: string;
  readonly stageWindow: TWindow;
  readonly topology: NetworkBlueprint<TWindow>;
  readonly policy: NetworkPolicy<TWindow>;
}

export interface MeshStepResult {
  readonly stage: PluginStage;
  readonly bindingCount: number;
  readonly emitted: number;
  readonly elapsedMs: TimeMs;
}

export interface MeshExecution {
  readonly tenantId: string;
  readonly mode: MeshMode;
  readonly runId: string;
  readonly steps: readonly MeshStepResult[];
  readonly startedAt: TimeMs;
  readonly finishedAt: TimeMs;
  readonly events: readonly string[];
}

export interface MeshHealth {
  readonly tenantId: string;
  readonly topologyHash: string;
  readonly matrix: StageWindowMatrix;
  readonly latestRecords: readonly HorizonStoreRecord[];
  readonly signalTotals: number;
}

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;
const stageWindowKey = (window: readonly PluginStage[]): string => window.join('|');

const topologyFromWindow = <TWindow extends readonly PluginStage[]>(
  tenantId: string,
  stageWindow: NoInfer<TWindow>,
  contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
): NetworkBlueprint<TWindow> => buildTopology(tenantId, stageWindow, contracts);

type ContractSeed = readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[];

const makeSeedContracts = <TWindow extends readonly PluginStage[]>(
  stageWindow: TWindow,
): ContractSeed => {
  const fallback = (windowIndex: number, stage: PluginStage): PluginConfig<PluginStage, JsonLike> => ({
    pluginKind: stage,
    payload: { stage, at: windowIndex, source: 'mesh-seed' },
    retryWindowMs: horizonBrand.fromTime(300),
  });

  return stageWindow.map((stage, index) => ({
    kind: stage,
    id: `plugin:${stage}:${index}` as PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>['id'],
    capabilities: [{
      key: stage,
      description: `Default contract for ${stage}`,
      configSchema: { stage },
    }],
    defaults: fallback(index, stage),
    execute: async (configs) => {
      const adapter = createSignalAdapter(stage);
      const signals = await adapter.execute(configs, new AbortController().signal);
      return signals.map((signal) => ({
        ...signal,
        input: {
          ...signal.input,
          tags: [...signal.input.tags, 'mesh'],
        },
      })) as HorizonSignal<PluginStage, JsonLike>[];
    },
  })) as ContractSeed;
};

export const runMesh = async (
  tenantId: string,
  stageWindow: readonly PluginStage[],
  seedSignals: readonly HorizonSignal<PluginStage, JsonLike>[],
): Promise<Result<readonly MeshExecution[]>> => {
  const contracts = makeSeedContracts(stageWindow) as NoInfer<ContractSeed>;
  const topology = topologyFromWindow(tenantId, stageWindow, contracts);
  const policy = resolvePolicy(stageWindow);
  const context: MeshContext<readonly PluginStage[]> = {
    tenantId,
    stageWindow,
    topology,
    policy,
  };

  const reports: MeshExecution[] = [];
  for (const mode of ['single', 'multi', 'canary'] as const) {
    const started = now();
    const workflow: WorkflowReport<PluginStage, JsonLike> = await runWorkflow(
      tenantId,
      mode,
      contracts as unknown as readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
      seedSignals,
    );

    const steps = workflow.bindings.map((binding) => ({
      stage: binding.stage,
      bindingCount: workflow.bindings.length,
      emitted: workflow.emitted,
      elapsedMs: now(),
    }));
    reports.push({
      tenantId,
      mode,
      runId: `run:${mode}:${context.topology.tenantId}:${workflow.bindings.length}`,
      steps,
      startedAt: started,
      finishedAt: now(),
      events: workflow.events,
    });
  }

  return ok(reports);
};

export const meshHealth = async (tenantId: string, stageWindow: readonly PluginStage[]): Promise<Result<MeshHealth>> => {
  const repository = createRepository(tenantId);
  const analytics = createAnalytics(repository);
  const matrixResult = await analytics.summarizeStages(tenantId, { tenantId, maxRows: 250, stages: stageWindow });
  if (!matrixResult.ok) {
    return err(matrixResult.error);
  }

  const read = await repository.read({ tenantId, stages: stageWindow, maxRows: 1000 });
  if (!read.ok) {
    return err(read.error);
  }

  return ok({
    tenantId,
    topologyHash: btoa(stageWindowKey(stageWindow)),
    matrix: matrixResult.value,
    latestRecords: read.value.items,
    signalTotals: read.value.total,
  });
};

export const summarizePlan = async (
  tenantId: string,
  seed: HorizonPlan<PluginStage>,
): Promise<Result<string>> => {
  const health = await meshHealth(tenantId, ['ingest', 'analyze', 'resolve', 'optimize', 'execute']);
  if (!health.ok) {
    return err(health.error);
  }
  return ok(`${seed.id}|${tenantId}|${health.value.signalTotals}|${health.value.topologyHash}`);
};
