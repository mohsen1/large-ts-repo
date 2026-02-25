import {
  buildWorkflowBlueprint,
  buildWorkflowSlices,
  mapWorkflowLayers,
  summarizeWorkflow,
} from '@domain/recovery-cascade-intelligence';
import type {
  CascadeBlueprint,
} from '@domain/recovery-cascade-intelligence';
import {
  createPluginRegistry,
  runTopologyAsync,
  summarizeRegistry,
  type PluginRegistry,
  type RuntimePlugin,
} from '@shared/cascade-intelligence-runtime';
import type { NoInfer } from '@shared/type-level';
import { mapAsync, type AsyncLikeIterable } from '@shared/typed-orchestration-core';
import { summarizeByTag, type RuntimeInsight } from './insights.js';
import { computeDependencies } from './telemetry.js';

interface WorkflowEngineEvent {
  readonly at: string;
  readonly stage: string;
  readonly action: 'enter' | 'resolve' | 'ready';
}

interface WorkflowEngineOptions {
  readonly tenantId: string;
  readonly namespace: string;
}

interface TimelinePath<TBlueprint extends CascadeBlueprint> {
  readonly stage: CascadeBlueprint['stages'][number]['name'];
  readonly order: number;
  readonly status: 'enter' | 'resolve' | 'ready';
}

type EngineState = 'idle' | 'hydrating' | 'planning' | 'executing' | 'draining' | 'complete';

interface WorkflowEnginePlan<TBlueprint extends CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly layers: Readonly<Record<string, readonly CascadeBlueprint['stages'][number]['name'][]>>;
  readonly summary: {
    readonly nodes: number;
    readonly path: number;
    readonly weight: number;
  };
}

export interface WorkflowPlanResult<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly state: EngineState;
  readonly events: readonly WorkflowEngineEvent[];
  readonly plan: WorkflowEnginePlan<TBlueprint>;
  readonly registries: readonly RuntimePlugin[];
  readonly snapshot: string;
}

type EngineRegistryMap = ReadonlyMap<string, PluginRegistry>;

const timelineFromBlueprint = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): readonly TimelinePath<TBlueprint>[] =>
  blueprint.stages
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((stage, index) => ({
      stage: stage.name,
      order: index,
      status: (index % 3 === 0 ? 'enter' : index % 3 === 1 ? 'resolve' : 'ready') as TimelinePath<TBlueprint>['status'],
    }));

const withWorkflowRegistry = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  tenantId: string,
): PluginRegistry => {
  const runtime = buildWorkflowBlueprint(blueprint);
  const registry = createPluginRegistry({
    namespace: `${tenantId}:${blueprint.namespace}`,
    mode: 'adaptive-ephemeral',
    labels: ['workflow', 'hydrate', tenantId],
  });
  registry.register({
    plugin: {
      pluginId: `plugin:${blueprint.policyId}` as RuntimePlugin['plugin']['pluginId'],
      name: `${tenantId}.workflow.${blueprint.namespace}`,
      mode: 'write',
      description: `workflow registry for ${blueprint.namespace}`,
      schema: ['write', 'read'],
      tags: ['tag:hydrate', 'tag:runtime'],
    },
    manifest: runtime.manifest,
    createdAt: new Date().toISOString(),
    active: true,
  } as RuntimePlugin);
  return registry;
};

const summarizeLayers = <TBlueprint extends CascadeBlueprint>(blueprint: TBlueprint): string => {
  const layerSummaries = buildWorkflowSlices(blueprint, 3).map((slice, index) => `layer-${index}:${slice.nodes.length}`);
  return `layers:${layerSummaries.join(',')}`;
};

export const planWorkflow = <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  options: WorkflowEngineOptions,
): WorkflowPlanResult<TBlueprint> => {
  const workflow = buildWorkflowBlueprint(blueprint);
  const summary = summarizeWorkflow(blueprint);
  const ordered = timelineFromBlueprint(blueprint);
  const plan: WorkflowEnginePlan<TBlueprint> = {
    blueprint,
    layers: mapWorkflowLayers(blueprint),
    summary: {
      nodes: summary.nodeCount,
      path: ordered.length,
      weight: summary.weightSum,
    },
  };
  const registries = [workflow.manifest] as unknown as readonly RuntimePlugin[];

  return {
    state: 'planning',
    events: ordered.map((entry) => ({
      at: new Date().toISOString(),
      stage: entry.stage as string,
      action: entry.status === 'resolve' ? 'resolve' : entry.status === 'ready' ? 'ready' : 'enter',
    })),
    plan,
    registries,
    snapshot: `${options.tenantId}:${workflow.id}:${summarizeLayers(blueprint)}:${summary.scope}`,
  };
};

const buildTimelineFromSource = (entries: readonly string[]): readonly string[] =>
  entries.toSorted().flatMap((entry, index) => [`${index}::${entry}`, `${entry}::${entry.length}`]);

export const buildPlanTopology = async <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
): Promise<readonly string[]> => {
  const order = computeDependencies(blueprint.stages);
  const source = order.map((stage) => ({ at: new Date().toISOString(), value: stage }));
  const sourceIterable: AsyncLikeIterable<{ readonly at: string; readonly value: string }> = {
    [Symbol.asyncIterator]: async function* () {
      for (const entry of source) {
        yield entry;
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    },
  };

  const withIndex = mapAsync(sourceIterable, async (entry) => ({
    index: order.indexOf(entry.value),
    stage: entry.value,
  }));
  return buildTimelineFromSource(
    [...(await Array.fromAsync(withIndex) as Promise<readonly { index: number; stage: string }[]>)].map((entry) =>
      `${entry.index}:${entry.stage}`,
    ),
  );
};

export const executeWorkflow = async <TBlueprint extends CascadeBlueprint>(
  blueprint: TBlueprint,
  options: WorkflowEngineOptions,
  plugins: readonly RuntimePlugin[] = [],
): Promise<{ readonly state: EngineState; readonly timeline: readonly WorkflowEngineEvent[]; readonly score: number }> => {
  const plan = planWorkflow(blueprint, options);
  const registry = withWorkflowRegistry(blueprint, options.tenantId);
  for (const plugin of plugins) {
    if (!registry.get(plugin.plugin.name)) {
      registry.register(plugin);
    }
  }

  const topology = await buildPlanTopology(blueprint);
  const summary = summarizeByTag(topology.map((entry) => ({ key: `insight:${entry}`, score: 1, tags: ['topology'], message: entry })));
  const timeline = topology
    .map((entry, index) => ({
      at: new Date().toISOString(),
      stage: entry,
      action: index % 2 === 0 ? 'ready' : index % 3 === 0 ? 'resolve' : 'enter',
    }))
    .toSorted((left, right) => right.at.localeCompare(left.at));

  const metricProfile = Object.values(summarizeRegistry(registry));
  const riskPenalty = [...(metricProfile as unknown as readonly number[])]
    .map((value) => String(value).length / 10)
    .reduce((acc, value) => acc + Number(value), 0);

  const runtimeInsights: RuntimeInsight = {
    key: `insight:workflow:${blueprint.namespace}` as const,
    score: Math.max(0, 1 - riskPenalty / 10),
    tags: ['workflow', 'orchestrator'],
    message: `${blueprint.namespace} executed ${topology.length}`,
  };

  return {
    state: 'complete',
    timeline,
    score: Math.max(0, 1 - riskPenalty / Math.max(1, topology.length)),
  };
};

export const buildEngineRegistry = <TBlueprint extends CascadeBlueprint>(
  blueprints: readonly TBlueprint[],
): EngineRegistryMap => {
  const output = new Map<string, PluginRegistry>();
  for (const blueprint of blueprints) {
    const registry = withWorkflowRegistry(blueprint, 'tenant:default');
    output.set(String(blueprint.namespace), registry);
  }
  return output;
};
