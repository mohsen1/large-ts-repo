import { withBrand } from '@shared/core';
import { createPluginSession } from '@shared/type-level';
import {
  parseTopology,
  type MeshTopology,
  type MeshRunId,
} from '@domain/recovery-ops-mesh';
import { createDensityPlugin, createTopologyPlugin } from './plugins';
import type {
  ObservabilityConfig,
  ObservabilityPluginContext,
  NoInfer,
  ObservabilityPlugin,
} from './types';
import { defaultWorkspaceConfig } from './types';

interface WorkspaceSeed<TTopology extends MeshTopology> {
  readonly topology: TTopology;
  readonly config: ObservabilityConfig;
  readonly plugins: readonly ObservabilityPlugin<any, any, string>[];
}

const resolveTopologySeed = <TTopology extends MeshTopology>(
  topologySeed: TTopology | Parameters<typeof parseTopology>[0],
): TTopology => {
  if ((topologySeed as MeshTopology)?.nodes !== undefined) {
    return topologySeed as TTopology;
  }
  return parseTopology(topologySeed) as TTopology;
};

export const createWorkspace = <TTopology extends MeshTopology>(
  topologySeed: Parameters<typeof parseTopology>[0],
  config?: Partial<ObservabilityConfig>,
): WorkspaceSeed<TTopology> => {
  const topology = resolveTopologySeed<TTopology>(topologySeed);
  const merged = {
    ...defaultWorkspaceConfig,
    ...config,
    namespace: config?.namespace ?? defaultWorkspaceConfig.namespace,
  } satisfies ObservabilityConfig;

  return {
    topology,
    config: merged,
    plugins: [createTopologyPlugin(topology), createDensityPlugin()],
  };
};

export const withWorkspace = async <
  TTopology extends MeshTopology,
  TReturn,
>(
  topologySeed: Parameters<typeof parseTopology>[0],
  config: Partial<ObservabilityConfig>,
  handler: (workspace: WorkspaceSeed<TTopology>, context: ObservabilityPluginContext) => Promise<TReturn>,
): Promise<TReturn> => {
  const workspace = createWorkspace<TTopology>(topologySeed, config);
  const context: ObservabilityPluginContext = {
    runId: withBrand(`run-${workspace.topology.id}-${Date.now()}`, 'MeshRunId'),
    planId: workspace.topology.id,
    plan: workspace.topology,
    startedAt: Date.now(),
    trace: [workspace.config.namespace],
  };

  const lease = createPluginSession([], {
    name: workspace.config.namespace,
    capacity: Math.max(2, workspace.config.maxPlugins),
  });

  await using stack = new AsyncDisposableStack();
  stack.defer(() => {
    lease[Symbol.dispose]();
  });

  return await handler(workspace, context);
};
