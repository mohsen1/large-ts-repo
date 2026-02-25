import { attachLease, type ResourceLease } from '@shared/stress-lab-runtime/async-resource-stack';
import {
  canonicalRuntimeNamespace,
  buildPlanId,
  buildRuntimeId,
  buildStepId,
  buildWorkspaceEnvelope,
  toWorkspaceDigest,
  type BrandId,
  type WorkspaceConfig,
  type WorkspaceEnvelope,
  type WorkspaceNamespace,
} from '@shared/stress-lab-runtime/advanced-lab-core';
import {
  type PipelineContext,
  PipelineStep,
  runPipeline,
  type PipelineTelemetry,
} from '@shared/stress-lab-runtime/iterative-pipeline';
import {
  CascadeRegistry,
  hydrateCascadeCatalog,
  mergeCascadeSnapshots,
  registryFingerprint,
  type PluginRecordKey,
} from '@shared/stress-lab-runtime/cascade-registry';
import {
  materializeTimeline,
  summarizeTimeline,
  timelineForEnvelope,
  toTimelineLines,
  type TimelineSequence,
} from '@shared/stress-lab-runtime/orchestration-timeline';
import {
  canonicalizeNamespace,
  buildPluginId,
  type PluginDependency,
  type PluginKind,
} from '@shared/stress-lab-runtime/ids';
import {
  type PluginContext,
  type PluginDefinition,
} from '@shared/stress-lab-runtime/plugin-registry';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';
import { executeGraphRun, type RunPlanInput } from '@service/recovery-lab-graph-orchestrator';

type StudioContextConfig = Record<string, never>;
type StudioRunId = BrandId<string, 'RunId'>;
type StudioPlanId = BrandId<string, 'PlanId'>;
type StudioStepId = BrandId<string, 'StepId'>;
type StudioWorkspaceConfig = WorkspaceConfig<{
  readonly mode: 'simulation';
  readonly channel: 'api';
}>;

type WorkspaceEnvelopeRecord = WorkspaceEnvelope<StudioContextConfig, StudioWorkspaceConfig>;
type RuntimePluginDefinition = PluginDefinition<unknown, unknown, { enabled: boolean }, PluginKind>;

type GraphNodeInput = {
  readonly id: string;
  readonly type: 'source' | 'transform' | 'merge' | 'sink';
  readonly route: string;
  readonly tags: readonly string[];
};

type GraphEdgeInput = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly latencyMs: number;
  readonly weight: number;
};

const defaultConfig = {
  timeoutMs: 20_000,
  maxConcurrency: 8,
  retryWindowMs: 250,
  featureFlags: { tracing: true, auditTrail: true },
  mode: 'simulation' as const,
  channel: 'api' as const,
} satisfies StudioWorkspaceConfig;

const workspaceNamespace = (): WorkspaceNamespace => canonicalRuntimeNamespace('prod:interactive:console');
const pluginRuntimeNamespace = 'recovery:lab:runtime' as const;
const pluginNamespace = canonicalizeNamespace(pluginRuntimeNamespace);

const buildBlueprintRuntimeId = (tenantId: string, scenarioId: string, namespace: WorkspaceNamespace): StudioRunId =>
  buildRuntimeId(tenantId, scenarioId, namespace) as StudioRunId;

const buildBlueprintPlanId = (tenantId: string, namespace: WorkspaceNamespace, scenarioId: string): StudioPlanId =>
  buildPlanId(tenantId, namespace, scenarioId) as StudioPlanId;

const defaultPlugins = [
  {
    id: buildPluginId(pluginNamespace, 'stress-lab/runtime', 'normalize'),
    name: 'normalize-step',
    namespace: pluginNamespace,
    kind: 'stress-lab/runtime',
    version: '1.0.0',
    tags: ['bootstrap', 'lab'],
    dependencies: [] as readonly PluginDependency[],
    config: { enabled: true },
    run: async (_context: PluginContext<{ enabled: boolean }>, input: unknown) => ({
      ok: true,
      value: input,
      generatedAt: new Date().toISOString(),
    }),
  },
  {
    id: buildPluginId(pluginNamespace, 'stress-lab/dispatch', 'dispatch'),
    name: 'dispatch-step',
    namespace: pluginNamespace,
    kind: 'stress-lab/dispatch',
    version: '1.0.0',
    tags: ['runtime', 'lab'],
    dependencies: ['dep:recovery:stress:lab'] as readonly PluginDependency[],
    config: { enabled: true },
    run: async (_context: PluginContext<{ enabled: boolean }>, input: unknown) => ({
      ok: true,
      value: { ...(input as Record<string, unknown>), dispatched: true },
      generatedAt: new Date().toISOString(),
    }),
  },
  {
    id: buildPluginId(pluginNamespace, 'stress-lab/telemetry', 'telemetry'),
    name: 'telemetry-step',
    namespace: pluginNamespace,
    kind: 'stress-lab/telemetry',
    version: '1.0.0',
    tags: ['telemetry', 'lab'],
    dependencies: ['dep:recovery:stress:lab'] as readonly PluginDependency[],
    config: { enabled: true },
    run: async (_context: PluginContext<{ enabled: boolean }>, input: unknown) => ({
      ok: true,
      value: { ...(input as Record<string, unknown>), telemetered: true },
      generatedAt: new Date().toISOString(),
    }),
  },
] as const satisfies readonly RuntimePluginDefinition[];

const pluginRuntimeRegistry = hydrateCascadeCatalog<'stress-lab/runtime' | 'stress-lab/dispatch' | 'stress-lab/telemetry', typeof pluginRuntimeNamespace>(
  pluginRuntimeNamespace,
  defaultPlugins,
);
const pluginLineage = mergeCascadeSnapshots([pluginRuntimeRegistry.snapshot()]);
const pluginLineageFingerprint = registryFingerprint(pluginRuntimeRegistry);

const buildNodeFromStep = (step: GraphStep<string>): GraphNodeInput => ({
  id: step.node,
  type: step.estimatedMs % 2 === 0 ? 'source' : step.estimatedMs % 3 === 1 ? 'merge' : 'transform',
  route: step.phase,
  tags: ['workload', step.intensity],
});

const buildEdgesFromNodes = (nodes: readonly GraphNodeInput[]): readonly GraphEdgeInput[] =>
  nodes
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .map((node, index, sequence) => ({
      id: `edge:${index}:${node.id}`,
      from: node.id,
      to: sequence.at(index + 1)?.id ?? node.id,
      latencyMs: 10 + index * 3,
      weight: 1,
    }));

const buildPipeline = (
  namespace: WorkspaceNamespace,
  steps: number,
): readonly [PipelineStep<readonly string[], readonly string[]>, PipelineStep<readonly string[], readonly string[]>, PipelineStep<readonly string[], readonly string[]>] => {
  const normalized = Math.max(1, steps);
  return [
    {
      label: `normalize:${namespace}`,
      weight: 10,
      execute: (input) => input.map((entry, index) => `${entry}#${index}`),
    },
    {
      label: `dispatch:${namespace}`,
      weight: 40,
      execute: (input) => [...input].toSorted().slice(0, normalized),
    },
    {
      label: `telemetry:${namespace}`,
      weight: 80,
      execute: (input) => input.map((entry) => `telemetry:${entry}`),
    },
  ];
};

export interface AdvancedBlueprintInput {
  readonly tenantId: string;
  readonly namespace: WorkspaceNamespace;
  readonly scenarioId: string;
  readonly graphSteps: readonly GraphStep<string>[];
}

export interface AdvancedBlueprint {
  readonly id: string;
  readonly scenarioId: string;
  readonly namespace: WorkspaceNamespace;
  readonly runId: StudioRunId;
  readonly steps: readonly StudioStepId[];
  readonly planId: StudioPlanId;
}

export const buildStudioBlueprint = (input: AdvancedBlueprintInput): AdvancedBlueprint => {
  const blueprintNamespace = input.namespace;
  const currentPlanId = buildBlueprintPlanId(input.tenantId, blueprintNamespace, input.scenarioId);
  return {
    id: `${input.tenantId}:${input.scenarioId}`,
    scenarioId: input.scenarioId,
    namespace: blueprintNamespace,
    runId: buildBlueprintRuntimeId(input.tenantId, input.scenarioId, blueprintNamespace),
    steps: input.graphSteps.map((step, index) => buildStepId(currentPlanId, step.phase, index)),
    planId: currentPlanId,
  };
};

export const executeAdvancedPlan = async (
  input: AdvancedBlueprintInput,
): Promise<{
  readonly envelope: WorkspaceEnvelopeRecord;
  readonly pipeline: PipelineTelemetry<unknown>;
  readonly timeline: TimelineSequence<unknown>;
  readonly timelineSummary: ReturnType<typeof summarizeTimeline>;
}> => {
  const blueprint = buildStudioBlueprint(input);
  const envelope = buildWorkspaceEnvelope<StudioContextConfig, StudioWorkspaceConfig>(
    input.tenantId,
    input.namespace,
    blueprint.planId,
    {} as StudioContextConfig,
    defaultConfig,
  );

  const outputSteps = input.graphSteps.map((step, index) => `${buildStepId(blueprint.planId, step.phase, index)}`);
  const pipelineChain = buildPipeline(input.namespace, input.graphSteps.length);
  const { telemetry } = await runPipeline(pipelineChain, outputSteps, {
    tenantId: input.tenantId,
    runId: blueprint.runId,
    startedAt: Date.now(),
  });

  const timelineMaterial = await materializeTimeline(
    input.tenantId,
    envelope as unknown as WorkspaceEnvelope<Record<string, unknown>, Record<string, never>>,
    'detailed',
  );

  const timelineSummary = summarizeTimeline(timelineMaterial.sequence);

  const nodes = input.graphSteps.map(buildNodeFromStep);
  const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
  const edges = buildEdgesFromNodes(uniqueNodes);

  const graphInput: RunPlanInput = {
    tenant: input.tenantId,
    namespace: input.namespace,
    nodes: uniqueNodes.map((node) => ({
      id: node.id,
      type: node.type,
      route: node.route,
      tags: node.tags,
    })),
    edges,
    steps: input.graphSteps.map((step) => ({
      id: step.id,
      name: step.name,
      phase: step.phase,
      node: step.node,
      intensity: step.intensity,
      plugin: step.plugin,
      estimatedMs: step.estimatedMs,
    })),
  };

  const graphResult = await executeGraphRun(graphInput);
  if (!graphResult.ok) {
    throw new Error(graphResult.error.message);
  }

  return {
    envelope,
    pipeline: telemetry,
    timeline: timelineMaterial.sequence,
    timelineSummary,
  };
};

export const readBlueprintDigest = (input: AdvancedBlueprint): string =>
  toWorkspaceDigest({
    namespace: input.namespace,
    planId: input.planId,
    createdAt: Date.now(),
    version: 2,
    steps: input.steps,
    plugins: input.steps.map((step) => String(step)),
  });

export const inspectRegistry = () => ({
  namespace: pluginRuntimeRegistry.namespace,
  fingerprint: pluginLineageFingerprint,
  count: pluginLineage.pluginCount,
});

export const filterByTag = (entries: readonly { tag: string }[], tags: readonly string[]): readonly { tag: string }[] => {
  const set = new Set(tags);
  return entries.filter((entry) => set.has(entry.tag));
};

export const mapStepsToPluginIds = (steps: readonly GraphStep<string>[]): readonly PluginRecordKey<PluginKind, string>[] =>
  steps.map((step) => `lab:step:${step.plugin}` as PluginRecordKey<PluginKind, string>);

export const prepareTimelineFromEnvelope = async (
  tenantId: string,
): Promise<{ readonly lines: string; readonly snapshot: { readonly planId: StudioPlanId } }> => {
  const blueprint = buildStudioBlueprint({
    tenantId,
    namespace: workspaceNamespace(),
    scenarioId: 'bootstrap',
    graphSteps: [],
  });
  const timelineEnvelope = buildWorkspaceEnvelope<StudioContextConfig, StudioWorkspaceConfig>(
    tenantId,
    workspaceNamespace(),
    blueprint.planId,
    {} as StudioContextConfig,
    defaultConfig,
  );
  const lines = toTimelineLines(
    await timelineForEnvelope(
      timelineEnvelope as unknown as WorkspaceEnvelope<Record<string, unknown>, Record<string, never>>,
    ),
  );

  return {
    lines,
    snapshot: { planId: blueprint.planId },
  };
};

export const withWorkspaceScope = async <T>(
  tenantId: string,
  requestId: string,
  run: (lease: ResourceLease) => Promise<T>,
): Promise<T> => attachLease(tenantId, requestId, run);

export const runPlanWithScope = async (
  config: AdvancedBlueprintInput,
  run: (input: WorkspaceEnvelopeRecord) => Promise<void>,
): Promise<{
  readonly output: PipelineTelemetry<unknown>;
  readonly timelineLines: string;
}> => {
  const result = await executeAdvancedPlan(config);
  await run(result.envelope);
  return {
    output: result.pipeline,
    timelineLines: toTimelineLines(result.timeline),
  };
};
