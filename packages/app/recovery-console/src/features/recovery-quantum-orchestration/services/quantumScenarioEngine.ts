import { withBrand } from '@shared/core';
import type { PluginId, OrchestrationPlugin } from '@shared/orchestration-kernel';
import { runWithAdapters, createBusFromManifest } from '@shared/orchestration-kernel';
import {
  QuantumPluginDirectory,
  type RegistrySelection,
  type WorkflowContext,
  type WorkflowNode,
  type WorkflowSeed,
  WorkflowGraph,
  defaultWorkflowSeed,
  summarizeGraph,
  createNode,
} from '@shared/orchestration-kernel';
import {
  QuantumPluginMetric,
  QuantumRoute,
  QuantumRunState,
  QuantumTelemetryPoint,
  QuantumWorkspace,
  createRunId,
  emptyMetrics,
  formatPluginRoute,
  inferSeverity,
  QuantumExecutionResult,
  toNodeIds,
} from '../types';
import type { TelemetryFrame } from '@shared/orchestration-kernel';

interface QuantumScenarioStep {
  readonly nodeId: string;
  readonly command: string;
  readonly expectedMs: number;
}

interface NormalizedTelemetryPoint {
  readonly at: string;
  readonly key: string;
  readonly value: number;
  readonly tags: readonly string[];
}

type LegacyPluginPhase = 'init' | 'plan' | 'execute' | 'observe' | 'finalize';

interface QuantumPluginCandidate {
  readonly id: PluginId;
  readonly namespace: string;
  readonly phase: LegacyPluginPhase;
  readonly tags: readonly string[];
  readonly description: string;
  readonly run: (input: unknown, context: { readonly options: { readonly deadlineMs?: number } }) => Promise<unknown> | unknown;
}

const legacyPluginSeeds = [
  {
    id: withBrand('quantum:collect', 'PluginId') as PluginId,
    namespace: 'recovery-collect',
    phase: 'init' as const,
    tags: ['collect', 'bootstrap'],
    description: 'Collect external signals into scenario context',
    run: async (input: unknown) => {
      const normalized = input as { readonly tenant: string };
      return {
        tenant: normalized.tenant,
        collected: 3,
      };
    },
  },
  {
    id: withBrand('quantum:plan', 'PluginId') as PluginId,
    namespace: 'recovery-plan',
    phase: 'plan' as const,
    tags: ['plan', 'orchestration'],
    description: 'Prepare recovery plan from signals',
    run: async (input: unknown) => {
      const normalized = input as { readonly collected: number };
      return {
        collected: normalized.collected,
        steps: normalized.collected + 1,
      };
    },
  },
  {
    id: withBrand('quantum:execute', 'PluginId') as PluginId,
    namespace: 'recovery-execute',
    phase: 'execute' as const,
    tags: ['execute', 'remediation'],
    description: 'Execute plan with safety checks',
    run: async (input: unknown) => {
      const normalized = input as { readonly steps: number };
      return {
        steps: normalized.steps,
        executed: normalized.steps * 2,
      };
    },
  },
  {
    id: withBrand('quantum:observe', 'PluginId') as PluginId,
    namespace: 'recovery-observe',
    phase: 'observe' as const,
    tags: ['observe', 'telemetry'],
    description: 'Observe outcomes and adjust strategy',
    run: async (input: unknown) => {
      const normalized = input as { readonly executed: number };
      return {
        executed: normalized.executed,
        confidence: Math.min(1, normalized.executed / 10),
      };
    },
  },
  {
    id: withBrand('quantum:finalize', 'PluginId') as PluginId,
    namespace: 'recovery-finalize',
    phase: 'finalize' as const,
    tags: ['final', 'audit'],
    description: 'Emit completion and close telemetry',
    run: async (input: unknown) => {
      const normalized = input as { readonly confidence: number };
      return {
        confidence: normalized.confidence,
        state: normalized.confidence > 0.7 ? 'complete' : 'errored',
      };
    },
  },
] as const satisfies readonly QuantumPluginCandidate[];

type LegacyPluginSeed = (typeof legacyPluginSeeds)[number];
const buildGraphSeed = (workspace: QuantumWorkspace): WorkflowSeed => {
  const collect = createNode({
    kind: 'input',
    phase: 'collect',
    namespace: 'collect',
    name: workspace.workspaceId,
    tags: ['collect'],
    run: async (input: { tenant: string }) => ({
      tenant: input.tenant,
      collectSignal: `${input.tenant}-signal`,
    }),
  }) as WorkflowNode;

  const plan = createNode({
    kind: 'transform',
    phase: 'plan',
    namespace: 'plan',
    name: workspace.workspaceId,
    tags: ['plan'],
    run: async (input: { tenant: string; collectSignal: string }) => ({
      planId: createRunId(input.tenant, `${workspace.runId}`),
      signal: input.collectSignal,
    }),
  }) as WorkflowNode;

  const execute = createNode({
    kind: 'observe',
    phase: 'execute',
    namespace: 'execute',
    name: workspace.workspaceId,
    tags: ['execute'],
    run: async (input: { planId: string; signal: string }) => ({
      planId: input.planId,
      confidence: Math.min(1, Math.max(0.01, input.signal.length / 100)),
    }),
  }) as WorkflowNode;

  const emit = createNode({
    kind: 'emit',
    phase: 'close',
    namespace: 'emit',
    name: workspace.workspaceId,
    tags: ['emit'],
    run: async (input: { planId: string; confidence: number }) => ({
      complete: input.confidence > 0.5,
      signal: input.planId,
    }),
  }) as WorkflowNode;

  return {
    nodes: [collect, plan, execute, emit],
    edges: [
      {
        from: collect.id,
        to: plan.id,
        reason: 'collect::plan',
        estimatedLatencyMs: 12,
      },
      {
        from: plan.id,
        to: execute.id,
        reason: 'plan::execute',
        estimatedLatencyMs: 17,
      },
      {
        from: execute.id,
        to: emit.id,
        reason: 'execute::emit',
        estimatedLatencyMs: 30,
      },
    ],
  };
};

const legacySteps = async (workspace: QuantumWorkspace): Promise<readonly QuantumScenarioStep[]> => {
  return [
    {
      nodeId: `collect:${workspace.workspaceId}`,
      command: `collect:${workspace.tenant}`,
      expectedMs: 40,
    },
    {
      nodeId: `plan:${workspace.workspaceId}`,
      command: `plan:${workspace.scenario.name}`,
      expectedMs: 80,
    },
    {
      nodeId: `execute:${workspace.workspaceId}`,
      command: `execute:${workspace.runId}`,
      expectedMs: 140,
    },
  ] as const;
};

const normalizePhase = (phase: LegacyPluginPhase): WorkflowContext['phase'] => {
  if (phase === 'init') {
    return 'collect';
  }
  if (phase === 'finalize') {
    return 'close';
  }
  if (phase === 'observe') {
    return 'verify';
  }
  return phase;
};

const metricsFromPlugins = (plugins: readonly QuantumPluginMetric[], at: string): readonly QuantumTelemetryPoint[] =>
  plugins.map((metric, index) => ({
    at,
    key: `${metric.pluginId}:${metric.phase}:${index}`,
    value: metric.score * 100,
    tags: [metric.pluginRoute, metric.health],
  }));

const pluginDirectory = new QuantumPluginDirectory(
  legacyPluginSeeds.map((seed) => {
    const basePlugin = {
      id: seed.id,
      namespace: seed.namespace,
      phase: seed.phase,
      version: '1',
      tags: seed.tags,
      description: seed.description,
      run: seed.run,
    } satisfies Omit<OrchestrationPlugin, 'run'> & {
      run: (input: unknown, context: { readonly options: { readonly deadlineMs?: number } }) => Promise<unknown> | unknown;
    };
    return basePlugin as OrchestrationPlugin;
  }),
);

const pluginDirectoryStats = pluginDirectory.summary;

const pluginRouteMetrics = (workspace: QuantumWorkspace, route: RegistrySelection): readonly QuantumPluginMetric[] => {
  void workspace;
  return pluginDirectory
    .byCriteria({
      namespace: route.namespace as string | undefined,
      phase: route.phase as never,
      tag: route.tag as string | undefined,
    })
    .map((plugin, index) => {
      const phase = normalizePhase(plugin.phase);
      const score = ((index + 1) * 17) / 100;
      return {
        pluginId: plugin.id,
        pluginRoute: formatPluginRoute(plugin.id, phase) as QuantumRoute,
        phase,
        score,
        health: inferSeverity(score),
        touchedAt: new Date().toISOString(),
      };
    });
};

export interface QuantumScenarioEngineConfig {
  readonly workspace: QuantumWorkspace;
  readonly mode: 'live' | 'sim';
  readonly seedTrace?: string;
}

export interface QuantumScenarioRun {
  readonly result: QuantumExecutionResult;
  readonly pluginMetrics: readonly QuantumPluginMetric[];
  readonly telemetry: readonly QuantumTelemetryPoint[];
}

const toTelemetryPoint = (frame: TelemetryFrame): NormalizedTelemetryPoint => ({
  at: frame.at,
  key: frame.id,
  value:
    (() => {
      const payload = frame.payload as { value?: unknown; score?: unknown };
      const value = payload.value;
      if (typeof value === 'number') {
        return value;
      }
      const score = payload.score;
      return typeof score === 'number' ? score : 0;
    })(),
  tags: ['generated', String(frame.kind)],
});

export const runQuantumScenario = async (config: QuantumScenarioEngineConfig): Promise<QuantumScenarioRun> => {
  const workspace = config.workspace;
  const seed = buildGraphSeed(workspace);
  const workflow = new WorkflowGraph(seed);
  const workflowSteps = await legacySteps(workspace);
  const pluginMetrics = pluginRouteMetrics(workspace, {
    namespace: 'recovery-collect',
    phase: 'init' as never,
    tag: undefined as never,
  });

  const topology = summarizeGraph(workflow, workspace.workspaceId);
  const busManifest = createBusFromManifest({
    id: 'runtime-bus',
    label: 'Runtime bus',
    namespace: 'recovery',
    supportsDispose: true,
  });
  let hasRunStarted = false;

  const runReport = await runWithAdapters(
    workflow,
    async () => {
      hasRunStarted = true;
      const context: WorkflowContext = {
        phase: 'collect',
        workspaceId: workspace.workspaceId,
        runId: workspace.runId,
      };
      const metrics: QuantumTelemetryPoint[] = [];
      for (const step of workflowSteps) {
        metrics.push({
          at: new Date().toISOString(),
          key: step.nodeId,
          value: step.expectedMs,
          tags: [step.command, 'scenario-step'],
        });
        await new Promise((resolve) => setTimeout(resolve, Math.min(12, step.expectedMs)));
      }
      void context;
      void busManifest;
      return { state: 'complete', confidence: 0.95 } as const;
    },
    { tenant: workspace.tenant, runId: workspace.runId } as { tenant: string; runId: string },
    {
      phase: 'collect',
      workspaceId: workspace.workspaceId,
      runId: workspace.runId,
    },
  );

  const runtimeTelemetry = metricsFromPlugins(pluginMetrics, new Date().toISOString());
  const mergedTelemetry = [
    ...emptyMetrics(workspace.runId),
    ...runReport.frames.map(toTelemetryPoint),
    ...runtimeTelemetry,
  ] as const;

  const route = pluginMetrics[0]?.pluginId ?? withBrand('quantum:fallback', 'PluginId');
  const criticalPath = workflow.criticalPaths()[0] ?? { nodes: toNodeIds(workflow.nodes()), durationMs: 0 };
  const firstMetricPhase = pluginMetrics[0]?.phase ?? 'collect';

  const resultState: QuantumRunState = hasRunStarted ? 'running' : 'complete';
  const result: QuantumExecutionResult = {
    runId: workspace.runId,
    startedAt: runReport.frames[0]?.at ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    route: `${route as string}:${firstMetricPhase}` as QuantumExecutionResult['route'],
    state: resultState,
    stateMessage: topology,
    pluginCount: pluginDirectoryStats.totalPlugins,
    criticalPath,
  };

  return {
    result,
    pluginMetrics,
    telemetry: mergedTelemetry,
  };
};

export const buildScenarioSteps = (workspace: QuantumWorkspace): readonly QuantumScenarioStep[] => [
  {
    nodeId: `collect:${workspace.workspaceId}`,
    command: 'collect-signals',
    expectedMs: 40,
  },
  {
    nodeId: `plan:${workspace.workspaceId}`,
    command: 'plan-recovery',
    expectedMs: 120,
  },
  {
    nodeId: `execute:${workspace.workspaceId}`,
    command: 'execute-recovery',
    expectedMs: 220,
  },
  {
    nodeId: `emit:${workspace.workspaceId}`,
    command: 'emit-complete',
    expectedMs: 18,
  },
];

export const defaultScenarioNode = (workspace: QuantumWorkspace): readonly WorkflowNode[] => buildGraphSeed(workspace).nodes;

export const defaultScenarioGraph = (workspace: QuantumWorkspace): WorkflowGraph =>
  new WorkflowGraph(buildGraphSeed(workspace));

export const hasDefaultPlugins = (): boolean => {
  const seed = defaultWorkflowSeed();
  return seed.nodes.length > 0 && seed.edges.length > 0;
};
