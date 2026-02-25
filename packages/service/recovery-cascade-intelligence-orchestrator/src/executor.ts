import { asBlueprint, createCascadeRunner } from '@domain/recovery-cascade-orchestration';
import type { StageRef } from '@domain/recovery-cascade-orchestration';
import type { CascadeBlueprint, CascadePolicyRun } from '@domain/recovery-cascade-intelligence';
import { type Result, fail, isOk, ok } from '@shared/result';
import {
  type OrchestratorOptions,
  type OrchestratorResult,
  type OrchestratorRunId,
  type OrchestratorSummary,
  type PlannerInput,
  type OrchestratorPolicyId,
  type StageTimeline,
  defaultOrchestratorOptions,
} from './types.js';
import {
  buildPlan,
  buildSummaryFromPlan,
  planSummaryFromTimeline,
  summarizePlan,
} from './planner.js';
import {
  toBlueprintSnapshot,
  computeDependencies,
  runTelemetryPipeline,
  normalizeStageWeights,
} from './telemetry.js';
import { buildRunInsights, scoreByCatalog } from './insights.js';
import { mapAsync } from '@shared/typed-orchestration-core';

type ExecutionRow = {
  readonly stage: string;
  readonly elapsedMs: number;
  readonly status: StageExecutionStatus;
};

type StageExecutionStatus = 'pending' | 'ok' | 'warn' | 'failed';

const toRiskBand = (score: number): 'critical' | 'high' | 'medium' | 'low' => {
  if (score >= 0.66) return 'low';
  if (score >= 0.4) return 'medium';
  return 'high';
};

const buildExecutionSummary = (timeline: readonly ExecutionRow[], startedAt: string): OrchestratorSummary => {
  const counts = timeline.reduce(
    (acc, entry) => {
      if (entry.status === 'ok') {
        acc.ok += 1;
      } else if (entry.status === 'warn') {
        acc.warn += 1;
      } else {
        acc.fail += 1;
      }
      return acc;
    },
    { ok: 0, warn: 0, fail: 0 },
  );

  return {
    okCount: counts.ok,
    warnCount: counts.warn,
    failCount: counts.fail,
    maxRisk: counts.fail > 0 ? 1 : counts.warn > 0 ? 0.4 : 0,
    startedAt,
    completedAt: new Date().toISOString(),
  };
};

const buildExecutionTimeline = async <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  cfg: OrchestratorOptions,
): Promise<readonly StageTimeline<TBlueprint>[]> => {
  const order = computeDependencies(blueprint.stages);
  const timeline: StageTimeline<TBlueprint>[] = [];

  for (let index = 0; index < order.length; index += 1) {
    const stage = order[index];
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 2 + Math.min(5, cfg.maxAdapters % 3)));
    const elapsed = Math.max(1, Math.round(performance.now() - started));
    const status = elapsed > cfg.timeoutMs / 20 ? 'warn' : 'ok';

    timeline.push({
      stage,
      status,
      durationMs: elapsed,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
  }

  return timeline;
};

const toExecution = <TBlueprint extends CascadeBlueprint>(
  plan: {
    runId: OrchestratorRunId;
    blueprint: TBlueprint;
    tenantId: TBlueprint['tenant']['id'];
  },
  timeline: readonly StageTimeline<TBlueprint>[],
  startedAt: string,
): {
  runId: OrchestratorRunId;
  blueprint: TBlueprint;
  tenantId: TBlueprint['tenant']['id'];
  status: CascadePolicyRun<TBlueprint>['status'];
  metrics: readonly {
    readonly name: string;
    readonly value: number;
    readonly unit: 'unit:ms';
    readonly dimensions: { readonly stage: string; readonly status: string };
    readonly measuredAt: string;
  }[];
  risk: {
    factor: `risk.${string}`;
    score: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
  };
  startedAt: string;
  finishedAt: string;
} => {
  const output = timeline.map((entry) => ({
    name: `${entry.stage}.duration` as const,
    value: entry.durationMs,
    unit: 'unit:ms' as const,
    dimensions: {
      stage: String(entry.stage),
      status: String(entry.status),
    },
    measuredAt: new Date().toISOString(),
  }));

  const weightMap = normalizeStageWeights(plan.blueprint.stages);
  const normalizedRisk = Number(
    (
      1 -
      timeline.reduce((acc, entry) => acc + (weightMap[String(entry.stage)] ?? 1), 0) / Math.max(1, timeline.length)
    ).toFixed(4),
  );

  return {
    runId: plan.runId,
    blueprint: plan.blueprint,
    tenantId: plan.tenantId,
    status: (timeline.some((entry) => entry.status === 'failed') ? 'warn' : 'ok'),
    metrics: output,
      risk: {
        factor: 'risk.execution' as const,
        score: normalizedRisk,
        severity: toRiskBand(1 - normalizedRisk),
      },
    startedAt,
    finishedAt: new Date().toISOString(),
  };
};

const toBootstrapStages = <TBlueprint extends CascadeBlueprint>(stages: TBlueprint['stages']) =>
  stages.map((stage) => ({
    name: stage.name,
    stageId: stage.stageId as unknown as StageRef,
    dependencies: stage.dependencies,
    input: stage.input,
    output: stage.output,
    metadata: stage.metadata,
    weight: stage.weight,
  }));

const buildTelemetrySource = <TBlueprint extends CascadeBlueprint>(
  timeline: readonly StageTimeline<TBlueprint>[],
) => ({
  [Symbol.asyncIterator]: async function* () {
    for (const entry of timeline) {
      yield {
        kind: 'stage.end' as const,
        stage: entry.stage,
        elapsedMs: entry.durationMs,
        at: entry.finishedAt ?? new Date().toISOString(),
      };
    }
  },
});

const toInsightSeed = (source: readonly string[]) =>
  source.map((entry): {
    readonly key: `insight:${string}`;
    readonly score: number;
    readonly tags: readonly string[];
    readonly message: string;
  } => ({
    key: `insight:${entry}`,
    score: 0.5,
    tags: [],
    message: entry,
  }));

const topologySnapshotPoints = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): string => {
  const snapshot = toBlueprintSnapshot(blueprint);
  return `${snapshot.count}:${snapshot.ordered.length}:${snapshot.tags.length}`;
};

export const executeCascadeIntelligence = async <
  TBlueprint extends CascadeBlueprint,
>(
  input: PlannerInput<TBlueprint>,
  options: Partial<OrchestratorOptions> = {},
): Promise<Result<OrchestratorResult<TBlueprint>>> => {
  const cfg: OrchestratorOptions = {
    ...defaultOrchestratorOptions,
    ...options,
  };

  const planResult = buildPlan(input, {
    maxAdapters: cfg.maxAdapters,
    labels: cfg.runTags,
    enforceTopology: cfg.enforceOrder,
  });
  if (!planResult.ok) {
    return fail(planResult.error);
  }

  const startedAt = new Date().toISOString();
  const plan = planResult.value;
  const timeline = await buildExecutionTimeline(plan.blueprint, cfg);
  const execution = toExecution(plan, timeline, startedAt);
  const summaryFromTimeline = planSummaryFromTimeline(timeline);
  const runId: OrchestratorRunId = `${plan.runId}` as OrchestratorRunId;

  const bootstrap = createCascadeRunner();
  const manifest = asBlueprint({
    tenantId: input.tenantId,
    name: String(plan.blueprint.namespace).replace(/^cascade-intel:/, ''),
    version: plan.blueprint.schemaVersion,
    stages: toBootstrapStages(plan.blueprint.stages),
    tags: ['orchestrator', 'recovery-cascade-intelligence', ...cfg.runTags],
  });
  const bootstrapResult = await bootstrap.run(manifest, input.tenantId, runId);
  if (!isOk(bootstrapResult)) {
    return fail(bootstrapResult.error);
  }

  const stageTelemetry = mapAsync(buildTelemetrySource(timeline), async (entry, index) => ({
    kind: entry.kind,
    stage: entry.stage,
    elapsedMs: entry.elapsedMs + index,
    at: entry.at,
  }));
  const topology = toBlueprintSnapshot(plan.blueprint);
  const telemetry = await runTelemetryPipeline(plan.blueprint.stages, stageTelemetry);
  const runInsights = buildRunInsights({
    runId,
    blueprint: plan.blueprint,
    risk: execution.risk,
    metrics: execution.metrics,
    status: execution.status,
    startedAt,
    finishedAt: execution.finishedAt,
    tenantId: plan.blueprint.tenant.id,
  });
  const summary = buildExecutionSummary(
    timeline.map((entry) => ({
      stage: String(entry.stage),
      elapsedMs: entry.durationMs,
      status: entry.status,
    })),
    startedAt,
  );
  const planSummary = buildSummaryFromPlan(plan);
  const telemetryScore = scoreByCatalog(
    toInsightSeed(telemetry.points).map((insight) => ({
      ...insight,
      score: 0.6,
      tags: ['telemetry'],
      message: `${insight.key}::${summaryFromTimeline.delta}::${topologySnapshotPoints(plan.blueprint)}`,
    })),
  );

  void toBlueprintSnapshot(plan.blueprint);
  void topology;

  const resolvedSummary = summarizePlan(plan);

  return ok({
    runId,
    blueprintName: plan.blueprint.namespace,
    execution: {
      ...execution,
      risk: {
        ...execution.risk,
        score: Math.min(1, execution.risk.score + telemetryScore),
      },
    },
    timeline: timeline.map((entry) => ({ ...entry })),
    metrics: execution.metrics,
    summary: {
      ...summary,
      maxRisk: Math.max(summary.maxRisk, runInsights.risk, planSummary.maxRisk),
    },
    insights: runInsights.insights
      .slice(0, resolvedSummary.orderedStageCount * 3 + 1)
      .map((entry) => entry.message),
  });
};

export class CascadeIntelligenceOrchestrator<TBlueprint extends CascadeBlueprint> {
  public constructor(private readonly options: Partial<OrchestratorOptions> = {}) {}

  public execute(
    input: Parameters<typeof executeCascadeIntelligence>[0] & PlannerInput<TBlueprint>,
  ): Promise<Result<OrchestratorResult<TBlueprint>>> {
    return executeCascadeIntelligence(input, this.options);
  }

  public runDefault(
    blueprint: TBlueprint,
    tenantId: TBlueprint['tenant']['id'],
    _policyId: OrchestratorPolicyId,
  ): Promise<Result<OrchestratorResult<TBlueprint>>> {
    return executeCascadeIntelligence(
      {
        blueprint,
        tenantId,
        policyId: `${tenantId}-default` as OrchestratorPolicyId,
        dryRun: false,
      },
      this.options,
    );
  }

  public [Symbol.dispose](): void {
    return;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve();
  }
}
