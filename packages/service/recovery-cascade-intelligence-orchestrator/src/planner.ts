import { mapStageInputs, normalizePolicyTemplate, orderStages } from '@domain/recovery-cascade-intelligence';
import type {
  CascadeBlueprint,
  StageInputByBlueprint,
  StageNameFromManifest,
} from '@domain/recovery-cascade-intelligence';
import { type Result, ok, fail } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import {
  type OrchestratorRunId,
  type OrchestratorPolicyId,
  type PlannerInput,
  type PlannerInputOptions,
  type PlannedRun,
  type StageTimeline,
  defaultOrchestratorOptions,
  buildOrchestratorSummary,
  type OrchestratorSummary,
} from './types.js';

export interface PlanStage<TBlueprint extends CascadeBlueprint> {
  readonly stage: StageNameFromManifest<TBlueprint>;
  readonly index: number;
  readonly estimateMs: number;
  readonly dependencyDepth: number;
  readonly dependencies: readonly string[];
}

export interface PlanSummary {
  readonly orderedStageCount: number;
  readonly dependencyCount: number;
  readonly confidence: number;
}

const resolveDryRunPenalty = (dryRun: boolean): number => (dryRun ? 0.05 : 1);

const resolveOptions = (options: PlannerInputOptions): Required<PlannerInputOptions> => ({
  maxAdapters: 8,
  labels: ['default'],
  enforceTopology: true,
  ...options,
});

const collectDependencies = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): ReadonlyArray<StageNameFromManifest<TBlueprint>> => {
  const ordered = orderStages(blueprint);
  const orderedSet = new Map<string, StageNameFromManifest<TBlueprint>>();
  for (const stage of ordered) {
    orderedSet.set(String(stage), stage);
  }
  return [...orderedSet.values()];
};

export const toNoInferPlan = <TBlueprint extends CascadeBlueprint>(
  plan: NoInfer<PlannedRun<TBlueprint>>,
): PlannedRun<TBlueprint> => plan;

const buildTimelineMetadata = <TBlueprint extends CascadeBlueprint>(ordered: readonly StageNameFromManifest<TBlueprint>[]) => {
  const grouped = [] as StageNameFromManifest<TBlueprint>[][];
  for (const [index, stage] of ordered.entries()) {
    const head = Math.floor(index / 3);
    const updated: StageNameFromManifest<TBlueprint>[] = [...(grouped[head] ?? []), stage];
    grouped[head] = updated;
  }

  return {
    stageCount: ordered.length,
    dependencyLayers: grouped,
  };
};

const normalizePolicyInput = <TBlueprint extends CascadeBlueprint>(input: PlannerInput<TBlueprint>) => {
  const template = normalizePolicyTemplate({
    policyId: String(input.policyId ?? input.blueprint.policyId),
    name: String(input.policyId ?? input.tenantId),
    namespace: `${input.blueprint.namespace}`.replace(/^policy:/, ''),
    blueprint: input.blueprint,
    constraints: [],
    thresholds: {
      'threshold.latency': 1200,
      'threshold.error': 0.02,
    },
  });

  return template;
};

export const buildPlan = <TBlueprint extends CascadeBlueprint>(
  input: PlannerInput<TBlueprint>,
  options: PlannerInputOptions = {},
): Result<PlannedRun<TBlueprint>> => {
  if (input.blueprint.stages.length === 0) {
    return fail(new Error('plan.empty'));
  }

  const normalized = resolveOptions(options);
  const orderedStages = collectDependencies(input.blueprint);
  const labels = normalized.labels;
  const payload = mapStageInputs(input.blueprint);
  const planStages: PlanStage<TBlueprint>[] = orderedStages.map((name, index) => {
    const stage = input.blueprint.stages.find((entry) => entry.name === name);
    const dependencies = [...(stage?.dependencies ?? [])];
    const estimate = 30 + labels.length * 8 + dependencies.length * 12 + index;
    return {
      stage: name,
      index,
      estimateMs: estimate,
      dependencyDepth: orderedStages.length - index,
      dependencies,
    };
  });

  const confidence = Math.max(
    0.05,
    Math.min(0.95, 0.45 + orderedStages.length * 0.03 + resolveDryRunPenalty(input.dryRun)),
  );

  const metadata = buildTimelineMetadata(orderedStages);

  return ok({
    runId: `${input.policyId ?? (input.blueprint.policyId as OrchestratorPolicyId)}:${input.tenantId}:${Date.now()}` as OrchestratorRunId,
    tenantId: input.tenantId,
    blueprint: input.blueprint,
    template: normalizePolicyInput(input),
    plan: planStages.map((entry) => ({
      stage: entry.stage,
      status: 'pending',
      durationMs: entry.estimateMs,
      output: payload,
      startedAt: new Date().toISOString(),
    })),
    confidence,
    metadata: {
      stageCount: metadata.stageCount,
      dependencyLayers: metadata.dependencyLayers,
    },
  });
};

export const planFromBlueprint = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): {
  readonly stageOrder: readonly TBlueprint['stages'][number]['name'][];
  readonly schema: string;
} => {
  const stageOrder = orderStages(blueprint);
  return {
    stageOrder,
    schema: blueprint.schemaVersion,
  };
};

export const summarizePlan = <TBlueprint extends CascadeBlueprint>(
  plan: PlannedRun<TBlueprint>,
): PlanSummary => ({
  orderedStageCount: plan.plan.length,
  dependencyCount: Math.max(0, plan.blueprint.stages.length - plan.plan.length),
  confidence: plan.confidence,
});

export const validatePlan = <TBlueprint extends CascadeBlueprint>(
  plan: PlannedRun<TBlueprint>,
): Result<PlannedRun<TBlueprint>> => {
  if (plan.plan.length === 0) {
    return fail(new Error('validate.plan-empty'));
  }

  if (!Number.isFinite(plan.metadata.stageCount)) {
    return fail(new Error('validate.plan-metadata'));
  }

  return ok(plan);
};

export const planSummaryFromTimeline = <TBlueprint extends CascadeBlueprint>(
  timeline: readonly StageTimeline<TBlueprint>[],
): { readonly delta: number } => {
  const failed = timeline.filter((entry) => entry.status === 'failed').length;
  const average = timeline.length === 0
    ? 0
    : timeline.reduce((acc, entry) => acc + entry.durationMs, 0) / timeline.length;
  return {
    delta: (failed === 0 ? 0.02 : 0.1) + Math.min(0.2, Math.max(0.01, average / 4_000)),
  };
};

export const enrichTimelineWithDiagnostics = <TBlueprint extends CascadeBlueprint>(
  plan: PlannedRun<TBlueprint>,
  diagnostics: readonly { readonly label: string; readonly value: number }[],
): PlannedRun<TBlueprint> => {
  const timeline: StageTimeline<TBlueprint>[] = plan.plan.map((entry, index) => ({
    ...entry,
    durationMs: entry.durationMs + Math.round(diagnostics[index % diagnostics.length]?.value ?? 0),
  }));
  const summary = planSummaryFromTimeline(timeline);
  return {
    ...plan,
    plan: timeline,
    confidence: Math.min(0.99, plan.confidence + summary.delta / 10),
  };
};

export const buildSummaryFromPlan = <TBlueprint extends CascadeBlueprint>(
  plan: PlannedRun<TBlueprint>,
): OrchestratorSummary => {
  const ok = plan.plan.filter((entry) => entry.status === 'ok').length;
  const warn = plan.plan.filter((entry) => entry.status === 'warn').length;
  const fail = plan.plan.filter((entry) => entry.status === 'failed').length;
  return buildOrchestratorSummary({
    ok,
    warn,
    fail,
    risk: 1 - Math.min(1, (warn + fail) / Math.max(1, plan.plan.length)),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
};

export const mergePlan = <TBlueprint extends CascadeBlueprint>(
  first: PlannedRun<TBlueprint>,
  second: PlannedRun<TBlueprint>,
): PlannedRun<TBlueprint> => {
  const plan = [...first.plan, ...second.plan];
  const layerSize = Math.max(first.metadata.dependencyLayers.length, 1);
  const mergedLayers = [
    ...first.metadata.dependencyLayers,
    ...second.metadata.dependencyLayers,
  ].map((layer) => [...layer] as StageNameFromManifest<TBlueprint>[]);

  return {
    ...first,
    runId: second.runId,
    plan,
    confidence: (first.confidence + second.confidence) / 2,
    metadata: {
      ...first.metadata,
      stageCount: plan.length,
      dependencyLayers: mergedLayers.slice(0, layerSize + second.metadata.dependencyLayers.length),
    },
  };
};

export const summarizeBlueprint = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Readonly<{ readonly title: string; readonly count: number }> => ({
  title: blueprint.namespace,
  count: blueprint.stages.length,
});

export const planTopologyLayers = <TBlueprint extends CascadeBlueprint>(
  ordered: readonly TBlueprint['stages'][number]['name'][],
): readonly TBlueprint['stages'][number]['name'][][] => {
  const grouped: TBlueprint['stages'][number]['name'][][] = [];
  let offset = 0;
  while (offset < ordered.length) {
    const chunk = ordered.slice(offset, offset + 3) as TBlueprint['stages'][number]['name'][];
    grouped.push(chunk);
    offset += 3;
  }
  return grouped;
};

export const buildBlueprintSnapshot = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  labels: readonly string[],
): Readonly<{ namespace: string; tags: readonly string[]; total: number }> => {
  const payload = mapStageInputs(blueprint);
  return {
    namespace: blueprint.namespace,
    tags: [...new Set([...labels, `blueprint.${blueprint.stages.length}`])],
    total: Object.keys(payload).length,
  };
};
