import { createRepository } from '@data/recovery-horizon-store';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';
import type {
  PluginStage,
  PluginConfig,
  HorizonPlan,
  TimeMs,
  JsonLike,
  HorizonSignal,
  PluginContract,
  StageLabel,
} from '@domain/recovery-horizon-engine';
import { horizonBrand } from '@domain/recovery-horizon-engine';
import {
  buildLifecycleGraph,
  withHorizonGraph,
  type GraphBuilderConfig,
  type HorizonLifecycleGraph,
} from '@domain/recovery-horizon-engine/graph-lifecycle';
import {
  buildBlueprintFromSteps,
  normalizePlanFromBlueprint,
  type DSLStep,
  type DSLPlan,
  type DSLPlanSpec,
} from '@domain/recovery-horizon-engine/plan-dsl';
import {
  HorizonOrchestrator,
} from './orchestrator';
import {
  type HorizonOrchestratorConfig,
  type HorizonOrchestratorResult,
} from './types.js';

const defaultOwnerPromise = Promise.resolve('lab-orchestrator');

const nowMs = (): TimeMs => Date.now() as TimeMs;

type LabPayload = {
  readonly tenantId?: string;
  readonly stage?: PluginStage;
  readonly order?: number;
  readonly source?: string;
};

const asLabPayload = (value: JsonLike): LabPayload => value as LabPayload;

const makeStageLabel = (stage: PluginStage): StageLabel<PluginStage> =>
  `${stage.toUpperCase()}_STAGE` as StageLabel<PluginStage>;

const resolveTenantId = (payload: JsonLike): string => {
  const tenantId = asLabPayload(payload).tenantId;
  return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : 'tenant-001';
};

const resolveOrder = (payload: JsonLike): number => {
  const order = asLabPayload(payload).order;
  return typeof order === 'number' ? order : 0;
};

export interface LabWorkspace {
  readonly tenantId: string;
  readonly stages: readonly PluginStage[];
  readonly owner: string;
  readonly tags: readonly string[];
}

export interface LabPlanBundle {
  readonly plan: HorizonPlan;
  readonly stages: readonly PluginStage[];
  readonly graph: HorizonLifecycleGraph;
  readonly planLabel: string;
  readonly runId: string;
  readonly createdAt: TimeMs;
}

export interface LabRunResponse {
  readonly tenantId: string;
  readonly runId: string;
  readonly stageWindow: readonly PluginStage[];
  readonly result: HorizonOrchestratorResult;
  readonly signalCount: number;
}

const asPlanStage = (stage: PluginStage, order: number, tenantId: string): PluginConfig<PluginStage, JsonLike> => ({
  pluginKind: stage,
  payload: {
    tenantId,
    stage,
    order,
    source: 'lab',
  } satisfies LabPayload,
  retryWindowMs: horizonBrand.fromTime(300 + order),
});

const toSignal = (value: PluginConfig<PluginStage, JsonLike>): HorizonSignal<PluginStage, JsonLike> => ({
  id: horizonBrand.fromPlanId(`signal:${resolveTenantId(value.payload)}:${value.pluginKind}:${Date.now()}`),
  kind: value.pluginKind,
  payload: value.payload,
  input: {
    version: '1.0.0',
    runId: horizonBrand.fromRunId(`run:${resolveTenantId(value.payload)}:${Date.now()}`),
    tenantId: resolveTenantId(value.payload),
    stage: value.pluginKind,
    tags: ['lab', value.pluginKind],
    metadata: {
      generated: new Date().toISOString(),
      source: 'lab',
      order: resolveOrder(value.payload),
    },
  },
  severity: 'low',
  startedAt: horizonBrand.fromDate(new Date().toISOString()),
});

const createContract = (owner: string, stage: PluginStage): PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike> => ({
  kind: stage,
  id: `${owner}:${stage}` as PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>['id'],
  capabilities: [
    {
      key: stage,
      description: `${owner}-${stage}-capability`,
      configSchema: {
        retryWindowMs: 'number',
      },
    },
  ],
  defaults: asPlanStage(stage, 0, 'tenant-001'),
  execute: async (configs: readonly PluginConfig<PluginStage, JsonLike>[]) => {
    const normalized = configs.filter((entry) => entry.pluginKind === stage);
    return normalized.map((entry) => toSignal(entry));
  },
});

const makeSteps = (tenantId: string, owner: string, stages: readonly PluginStage[]): readonly DSLStep<PluginStage, JsonLike>[] => {
  return stages.map((stage, order) => {
    const contract = createContract(owner, stage);
    const config = asPlanStage(stage, order, tenantId);
    return {
      stage,
      label: makeStageLabel(stage),
      contract,
      config,
      weight: 1,
      timeoutMs: 250 + order,
      enabled: true,
      execute: async () => [toSignal(config)],
    };
  });
};

const buildLabSpec = (
  tenantId: string,
  planName: string,
  workspace: LabWorkspace,
): DSLPlanSpec<readonly PluginStage[]> => ({
  tenantId,
  namespace: planName,
  stages: workspace.stages,
  defaultOwner: workspace.owner,
  tags: [...workspace.tags],
  labelByStage: workspace.stages.map((stage) => makeStageLabel(stage)),
});

const buildGraph = (tenantId: string, stages: readonly PluginStage[]) => {
  const graphConfig: GraphBuilderConfig = {
    tenantId,
    namespace: 'lab',
    refreshMs: 180,
    tags: ['lab', tenantId],
  };
  return {
    graph: buildLifecycleGraph(graphConfig, stages),
    stageCount: stages.length,
  };
};

export const buildLabBundle = async (
  workspace: LabWorkspace,
  planName = `lab-${workspace.tenantId}`,
): Promise<Result<LabPlanBundle>> => {
  const owner = await defaultOwnerPromise;
  const steps = makeSteps(workspace.tenantId, workspace.owner ?? owner, workspace.stages);
  const blueprint = buildBlueprintFromSteps(
    buildLabSpec(workspace.tenantId, planName, workspace),
    steps,
  );

  const runId = blueprint.runId;
  const graph = buildLifecycleGraph(
    {
      tenantId: workspace.tenantId,
      namespace: planName,
      refreshMs: 180,
      tags: ['lab', workspace.owner],
    },
    workspace.stages,
  );

  const plan = normalizePlanFromBlueprint(
    blueprint as DSLPlan<readonly PluginStage[]>,
    steps.map((step) => step.contract),
  );

  return ok({
    plan,
    stages: workspace.stages,
    graph,
    planLabel: `${workspace.tenantId}:${workspace.owner}:${planName}`,
    runId,
    createdAt: nowMs(),
  });
};

export const runLabCycle = async (
  tenantId: string,
  stageWindow: readonly PluginStage[],
  owner = 'lab-orchestrator',
): Promise<Result<LabRunResponse>> => {
  const bundle = await buildLabBundle(
    {
      tenantId,
      stages: stageWindow,
      owner,
      tags: ['lab', tenantId],
    },
    `run-${tenantId}`,
  );

  if (!bundle.ok) {
    return err(bundle.error);
  }

  const repository = createRepository(tenantId);
  const orchestrator = new HorizonOrchestrator(
    repository,
    {
      tenantId,
      planName: bundle.value.planLabel,
      stageWindow: bundle.value.stages,
      refreshIntervalMs: 150,
      tags: ['lab', tenantId, owner],
      owner,
    } satisfies HorizonOrchestratorConfig,
  );

  const result = await orchestrator.run(bundle.value.plan);
  return ok({
    tenantId,
    runId: bundle.value.runId,
    stageWindow,
    result,
    signalCount: result.stages.length,
  });
};

export const runLabWithHorizonGraph = async (
  tenantId: string,
  stageWindow: readonly PluginStage[],
): Promise<Result<number>> => {
  const { graph } = buildGraph(tenantId, stageWindow);
  return withHorizonGraph(
    {
      tenantId,
      namespace: 'diagnostic',
      refreshMs: 160,
      tags: ['diagnostic', tenantId],
    },
    stageWindow,
    async () => {
      const plan = graph.toPlan();
      const repository = createRepository(tenantId);
      const orchestrator = new HorizonOrchestrator(
        repository,
        {
          tenantId,
          planName: 'diagnostic',
          stageWindow,
          refreshIntervalMs: 160,
          tags: ['diagnostic', tenantId],
          owner: 'diagnostic',
        },
      );
      const run = await orchestrator.run(plan);
      return ok(run.stages.length);
    },
  );
};

export const runDefaultLab = async (tenantId: string): Promise<Result<LabRunResponse>> => {
  return runLabCycle(tenantId, ['ingest', 'analyze', 'resolve', 'optimize', 'execute']);
};
