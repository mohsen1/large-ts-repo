import {
  PluginRegistry,
  withAsyncDispose,
  type PluginDefinition,
} from '@shared/command-graph-kernel';
import type { TopologyMap, TopologyVertex } from '@shared/command-graph-kernel';
import { buildTopology } from './graphBuilder';
import { parseBlueprint } from './validators';
import type { CommandShape, WorkspaceBlueprint, WorkspaceId } from './models';

export interface ExecutionTrace {
  readonly step: string;
  readonly ok: boolean;
  readonly latencyMs: number;
}

export interface ExecutionResult {
  readonly runId: string;
  readonly elapsedMs: number;
  readonly trace: ReadonlyArray<ExecutionTrace>;
}

export interface ExecutionPlan {
  readonly runId: string;
  readonly workspaceId: WorkspaceId;
  readonly blueprint: WorkspaceBlueprint;
  readonly topology: TopologyMap<Record<string, readonly string[]>>;
  readonly vertexOrder: readonly TopologyVertex[];
}

export const executeBlueprint = async <
  TRegistry extends Record<string, PluginDefinition<any, any, any, any, any>>,
>(
  tenantId: string,
  runId: string,
  registry: PluginRegistry<TRegistry>,
  blueprint: WorkspaceBlueprint,
  commands: readonly CommandShape[],
): Promise<ExecutionResult> => {
  const topology = buildTopology(blueprint);
  const [entryPoint] = blueprint.commandOrder;
  const ordered = entryPoint ? [String(entryPoint).replace('command:', '')] : [];

  const lookup = new Map<string, CommandShape>();
  for (const command of commands) {
    lookup.set(String(command.id), command);
  }

  return withAsyncDispose(async (_stack, scope) => {
    const trace: ExecutionTrace[] = [];
    const startedAt = Date.now();
    const pluginKey = registry.keys()[0] as keyof TRegistry & string | undefined;

    for (const node of ordered) {
      const command = lookup.get(`command:${node}`) ?? lookup.get(`${node}`);
      const start = Date.now();

      if (!pluginKey || !command) {
        continue;
      }

      scope.open(`run/${runId}/${node}`);
      const result = await registry.run(
        pluginKey,
        {
          scopeId: `${tenantId}:${runId}`,
          runId,
          startedAt: new Date().toISOString(),
          state: { topology, node },
          signalCancel: () => {
            // no-op
          },
        },
        command as Parameters<TRegistry[typeof pluginKey]['run']>[1],
      );

      trace.push({
        step: node,
        ok: result.ok,
        latencyMs: Date.now() - start,
      });
    }

    return {
      runId,
      elapsedMs: Date.now() - startedAt,
      trace,
    };
  });
};

export const planExecution = (raw: {
  runId: string;
  workspaceId: WorkspaceId;
  title: string;
  commands: readonly unknown[];
  edges: readonly unknown[];
  tags: readonly string[];
}): ExecutionPlan => {
  const blueprint = parseBlueprint({
    workspaceName: raw.workspaceId,
    title: raw.title,
    commands: raw.commands,
    edges: raw.edges,
    tags: raw.tags,
  });
  const topology = buildTopology(blueprint);
  return {
    runId: raw.runId,
    workspaceId: raw.workspaceId,
    blueprint,
    topology,
    vertexOrder: Object.entries(topology).map(([id, value]) => ({
      id: `vertex:${id}` as const,
      label: id,
      metadata: { out: value.outgoing.length, in: value.incoming.length },
    })),
  };
};

export const executionTopology = (blueprint: WorkspaceBlueprint): readonly TopologyVertex[] => {
  const topology = buildTopology(blueprint);
  return Object.entries(topology).map(([id, value]) => ({
    id: `vertex:${id}` as const,
    label: id,
    metadata: { out: value.outgoing.length, in: value.incoming.length },
  }));
};
