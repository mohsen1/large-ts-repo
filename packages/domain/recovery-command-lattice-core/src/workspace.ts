import type { PluginDefinition } from '@shared/command-graph-kernel';
import {
  PluginRegistry,
  type PluginInput,
  type PluginOutput,
  type PluginResult,
} from '@shared/command-graph-kernel';
import type { TopologyMap } from '@shared/command-graph-kernel';
import { buildTopology } from './graphBuilder';
import type {
  CommandDependencyEdge,
  WorkspaceBlueprint,
  WorkspaceId,
  SessionId,
} from './models';
import { makeSessionId, makeWorkspaceId } from './models';
import { parseBlueprint } from './validators';

export interface WorkspaceSnapshot {
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
  readonly commandCount: number;
  readonly topologyKeys: readonly string[];
  readonly summaryTags: readonly string[];
  readonly blueprint: WorkspaceBlueprint;
}

export interface WorkspacePatch {
  readonly tags?: readonly string[];
}

export class CommandWorkspace<TPlugins extends Record<string, PluginDefinition<any, any, any, any, any>>> {
  readonly #tenant: string;
  #blueprint: WorkspaceBlueprint;
  #topology: TopologyMap<Record<string, readonly string[]>>;

  constructor(
    tenant: string,
    rawBlueprint: WorkspaceBlueprint,
    private readonly registry: PluginRegistry<TPlugins>,
  ) {
    this.#tenant = tenant;
    this.#blueprint = rawBlueprint;
    this.#topology = buildTopology(rawBlueprint);
  }

  get snapshot(): WorkspaceSnapshot {
    const workspaceId = makeWorkspaceId(this.#tenant, this.#blueprint.title);
    return {
      workspaceId,
      sessionId: makeSessionId(this.#tenant, workspaceId),
      commandCount: this.#blueprint.commandOrder.length,
      topologyKeys: [...this.#blueprint.commandOrder].map((entry) => String(entry)),
      summaryTags: this.#blueprint.tags,
      blueprint: this.#blueprint,
    };
  }

  get topology(): TopologyMap<Record<string, readonly string[]>> {
    return this.#topology;
  }

  getEdges(): readonly CommandDependencyEdge[] {
    return this.#blueprint.graph;
  }

  addTag(tag: string): void {
    if (!this.#blueprint.tags.includes(tag)) {
      this.#blueprint = {
        ...this.#blueprint,
        tags: [...this.#blueprint.tags, tag],
      };
    }
  }

  patch(patch: WorkspacePatch): WorkspaceSnapshot {
    if (patch.tags) {
      this.#blueprint = {
        ...this.#blueprint,
        tags: [...patch.tags],
      };
    }
    return this.snapshot;
  }

  pluginKeys(): readonly string[] {
    return this.registry.keys().map((key) => String(key));
  }

  async execute<K extends keyof TPlugins & string>(
    pluginName: K,
    command: PluginInput<TPlugins[K]>,
  ): Promise<PluginResult<PluginOutput<TPlugins[K]>>> {
    const context = {
      scopeId: String(this.snapshot.workspaceId),
      runId: `${String(this.snapshot.workspaceId)}:${Date.now()}`,
      startedAt: new Date().toISOString(),
      state: {},
      signalCancel: () => {
        // no-op
      },
    } as Parameters<TPlugins[K]['run']>[0];

    return this.registry.run(pluginName, context, command) as Promise<PluginResult<PluginOutput<TPlugins[K]>>>;
  }
}

export const restoreWorkspace = <TPlugins extends Record<string, PluginDefinition<any, any, any, any, any>>>(
  tenant: string,
  registry: PluginRegistry<TPlugins>,
  source: {
    workspaceName: WorkspaceId;
    commands: readonly unknown[];
    edges: readonly unknown[];
    tags: readonly string[];
  },
): CommandWorkspace<TPlugins> => {
  const blueprint = parseBlueprint({
    workspaceName: source.workspaceName,
    title: String(source.workspaceName),
    commands: source.commands,
    edges: source.edges,
    tags: source.tags,
  });
  return new CommandWorkspace<TPlugins>(tenant, blueprint, registry);
};
