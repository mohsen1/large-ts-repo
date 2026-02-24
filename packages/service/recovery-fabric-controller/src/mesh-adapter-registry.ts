import { fail, ok, type Result } from '@shared/result';
import {
  asMeshCommandId,
  asMeshNodeId,
  type MeshCommandId,
  type MeshExecutionContext,
  type MeshManifestEntry,
  type MeshOrchestrationOutput,
  type MeshWaveCommandId,
} from '@domain/recovery-fusion-intelligence';
import { MeshPluginRegistry } from '@domain/recovery-fusion-intelligence/src/mesh-registry';
import { collectPlanMetrics } from '@domain/recovery-fusion-intelligence/src/mesh-planner';
import { mapByPhase } from '@domain/recovery-fusion-intelligence/src/mesh-runtime-graph';

export interface MeshAdapterTask {
  readonly manifest: MeshManifestEntry;
  readonly startedAt: string;
  readonly commandIds: readonly MeshWaveCommandId[];
}

type AdapterLog = readonly { readonly message: string; readonly timestamp: string }[];

const taskPhaseWindow = (task: MeshAdapterTask): readonly string[] =>
  task.commandIds.map((commandId) => `${task.manifest.pluginId}:${commandId}`).toSorted();

export const registerAdapters = (
  manifests: readonly MeshManifestEntry[],
  context: MeshExecutionContext,
): Result<MeshPluginRegistry, Error> => {
  const registry = MeshPluginRegistry.create({ plugins: [], strict: true });
  for (const manifest of manifests.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!manifest.name || manifest.name.length < 6) {
      return fail(new Error(`invalid plugin name: ${manifest.name}`));
    }

    void manifest.dependencies;
    void context;
  }

  return ok(registry);
};

export const buildAdapterTaskFeed = (tasks: readonly MeshAdapterTask[]): AdapterLog => {
  return tasks.flatMap((task) => {
    const base = taskPhaseWindow(task);
    return [
      ...base.map((commandId) => ({ message: `enqueue:${commandId}`, timestamp: task.startedAt })),
      { message: `complete:${task.manifest.name}`, timestamp: new Date().toISOString() },
    ];
  });
};

export const summarizeOutputCommands = (
  output: MeshOrchestrationOutput,
  context: MeshExecutionContext,
): readonly MeshCommandId[] => {
  const metrics = collectPlanMetrics(output.waves);
  const indexMap = mapByPhase(context.topology.edges);
  const inherited = output.commandIds.map((_, index) =>
    asMeshCommandId(
      output.runId,
      context.topology.nodes[index % context.topology.nodes.length]?.id ?? asMeshNodeId('inherit'),
      index,
    ),
  );
  const metricCommands = metrics.flatMap((metric, metricIndex) =>
    asMeshCommandId(output.runId, context.topology.nodes[metricIndex % context.topology.nodes.length]?.id ?? asMeshNodeId('metric-nominal'), metricIndex),
  );
  const topologyCommands = Object.values(indexMap).flatMap((edgeSet, phaseIndex) =>
    (edgeSet ?? []).flatMap((edge, edgeIndex) =>
      asMeshCommandId(output.runId, context.topology.nodes[edgeIndex % context.topology.nodes.length]?.id ?? asMeshNodeId('edge-nominal'), phaseIndex + edgeIndex),
    ),
  );

  const commandIds = [...inherited, ...metricCommands, ...topologyCommands];
  const unique = new Set<MeshCommandId>(commandIds);

  return Object.freeze([...unique]);
};
