import { useMemo } from 'react';
import {
  PluginRegistry,
  buildPlugin,
  pluginNamespace,
  pluginVersion,
  brandValue,
  getManifest,
  manifestChannelIds,
  manifestSatisfies,
  commandManifestSeed,
  type PluginDefinition,
} from '@shared/command-graph-kernel';
import {
  type CommandShape,
  type WorkspaceBlueprint,
  type WorkspaceMetrics,
  type WorkspaceId,
  parseBlueprint,
  isCommandShape,
  summarizeBlueprint,
  CommandWorkspace,
  buildTopology,
} from '@domain/recovery-command-lattice-core';

export type GraphSessionMode = 'live' | 'replay' | 'diagnostic';

export interface GraphOrchestrationEvent {
  readonly at: string;
  readonly kind: 'metric' | 'error';
  readonly detail: string;
}

export interface GraphServiceConfig {
  readonly tenant: string;
  readonly scenario: string;
  readonly mode: GraphSessionMode;
}

type CockpitPlugin = PluginDefinition<
  CommandShape,
  { readonly status: 'ok' | 'skip' } | { readonly status: string },
  Record<string, unknown>,
  'kind:orchestrator',
  'namespace:recovery-cockpit-graph'
>;
type CockpitPlugins = { orchestrator: CockpitPlugin };

export interface GraphServiceState {
  readonly workspace: CommandWorkspace<CockpitPlugins>;
  readonly status: 'idle' | 'running' | 'completed' | 'failed';
  readonly events: readonly GraphOrchestrationEvent[];
  readonly metrics: WorkspaceMetrics;
  readonly topologyNodes: readonly string[];
}

interface GraphServiceHandle {
  readonly config: GraphServiceConfig;
  readonly workspace: CommandWorkspace<Record<string, CockpitPlugin>>;
  readonly manifest: ReturnType<typeof getManifest>;
  readonly topology: ReturnType<typeof buildTopology>;
  readonly topologyNodes: readonly string[];
  readonly summary: ReturnType<typeof summarizeBlueprint>;
  start: () => Promise<{ readonly runId: string; readonly elapsedMs: number; readonly traces: readonly GraphOrchestrationEvent[] }>;
  readonly state: GraphServiceState;
}

const bootstrapPalette = manifestChannelIds(commandManifestSeed);

const toCommandShape = (tenant: string, index: number): CommandShape => ({
  id: `command:${tenant}:${String(index).padStart(4, '0')}` as CommandShape['id'],
  title: `bootstrap-${index}`,
  severity: index % 3 === 0 ? 'p0' : index % 3 === 1 ? 'p1' : 'p2',
  payload: { value: index * 1_000 },
  createdAt: new Date(Date.now() + index * 100).toISOString(),
});

const buildSeedBlueprint = (tenant: string, scenario: string): WorkspaceBlueprint =>
  parseBlueprint({
    workspaceName: brandValue('workspace', `${tenant}/${scenario}`) as WorkspaceId,
    title: scenario,
    commands: [...Array(5)].map((_, index) => toCommandShape(tenant, index)),
    edges: [...Array(4)].map((_, index) => ({
      from: `command:${tenant}:${String(index).padStart(4, '0')}`,
      to: `command:${tenant}:${String(index + 1).padStart(4, '0')}`,
      label: index % 2 === 0 ? 'normal::edge' : 'replay::edge',
    })),
    tags: bootstrapPalette,
  });

const plugin: CockpitPlugin = buildPlugin(
  pluginNamespace('recovery-cockpit-graph'),
  'kind:orchestrator',
  {
    tags: ['tag:graph', 'tag:recovery', 'tag:tenant-cockpit'],
    version: pluginVersion.create(1, 1, 0),
    dependencies: ['dependency:command-graph-kernel'],
    inputSchema: isCommandShape,
    outputSchema: (value: unknown): value is { readonly status: 'ok' | 'skip' } => {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      return (value as { status: unknown }).status === 'ok' || (value as { status: unknown }).status === 'skip';
    },
    async run(_context, input) {
      return {
        ok: true,
        value: {
          status: input.severity === 'p0' ? 'ok' : 'skip',
        },
        generatedAt: new Date().toISOString(),
      };
    },
  },
);

const createRegistry = (): PluginRegistry<CockpitPlugins> => new PluginRegistry({ orchestrator: plugin });

const commandShapeSeverity = (commandId: string): CommandShape['severity'] => {
  const indexPart = commandId.split(':').at(-1);
  const index = Number.parseInt(indexPart ?? '0', 10);
  if (Number.isNaN(index)) {
    return 'p1';
  }
  return index % 3 === 0 ? 'p0' : index % 3 === 1 ? 'p1' : 'p2';
};

export const buildGraphService = (config: GraphServiceConfig): GraphServiceHandle => {
  const manifest = getManifest();
  if (!manifestSatisfies(manifest)) {
    throw new Error('invalid manifest snapshot');
  }

  const blueprint = buildSeedBlueprint(config.tenant, config.scenario);
  const registry = createRegistry();
  const workspace = new CommandWorkspace(config.tenant, blueprint, registry);
  const topology = buildTopology(blueprint);
  const summary = summarizeBlueprint(blueprint);

  const metrics: WorkspaceMetrics = {
    commandCount: blueprint.commandOrder.length,
    criticalCount: blueprint.commandOrder.filter((entry) => String(entry).includes('0')).length,
    replayRatio: summary.bottlenecks.length / Math.max(1, blueprint.commandOrder.length),
    latencyBudgetMs: 1_200,
  };

  return {
    config,
    workspace,
    manifest,
    topology,
    topologyNodes: Object.keys(topology),
    summary,
    start: async () => {
      const traces: GraphOrchestrationEvent[] = [];
      const runId = `run:${config.scenario}:${Date.now()}`;
      const startedAt = Date.now();

      for (const command of blueprint.commandOrder) {
        const commandShape = {
          id: command,
          title: `command-${String(command)}`,
          severity: commandShapeSeverity(String(command)),
          payload: {},
          createdAt: new Date().toISOString(),
        } as CommandShape;

        const result = await workspace.execute('orchestrator', commandShape);
        traces.push({
          at: new Date().toISOString(),
          kind: result.ok ? 'metric' : 'error',
          detail: result.ok ? `ok:${String(command)}` : `error:${result.error}`,
        });
      }

      return {
        runId,
        elapsedMs: Date.now() - startedAt,
        traces,
      };
    },
    state: {
      workspace,
      status: 'idle',
      events: [
        {
          at: new Date().toISOString(),
          kind: 'metric',
          detail: `topology-size:${Object.keys(topology).length}`,
        },
      ],
      metrics,
      topologyNodes: Object.keys(topology),
    },
  };
};

export const useMemoizedGraphService = (config: GraphServiceConfig) =>
  useMemo(() => buildGraphService(config), [config.tenant, config.scenario, config.mode]);
