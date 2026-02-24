import {
  canonicalizeNamespace,
  type PluginContext,
  type PluginDependency,
  type PluginDefinition,
  type PluginResult,
  buildPluginDefinition,
  buildPluginVersion,
} from '@shared/stress-lab-runtime';
import { collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import { type NoInfer } from '@shared/type-level';
import {
  CommandRunbook,
  WorkloadId,
  type CommandRunbookId,
  createRunbookId,
} from './models';
import {
  createWorkflowRunId,
  summarizeExecutionResult,
  buildAdvancedTopologyGraph,
  topSignals,
  stageEnvelopeRoute,
  workspaceMeta,
  type WorkflowInputEnvelope,
  type WorkflowMode,
  type WorkflowPlanEnvelope,
  type WorkflowRecommendation,
  type WorkflowRecommendationEnvelope,
  type WorkflowReportEnvelope,
  type WorkflowShapeEnvelope,
  type WorkflowSimulationEnvelope,
  type WorkflowFinalizeEnvelope,
  type WorkflowStage,
  type WorkflowTopology,
  type WorkflowWorkspaceSeed,
  type WorkflowStageOutput,
  type WorkflowExecutionStage,
  type WorkflowExecutionTrace,
  type RecoverySignal,
  type RecoverySignalId,
  type RecoverySimulationResult,
  type WorkflowRecommendation as RecommendationRecord,
  WORKFLOW_STAGES,
} from './advanced-workflow-models';
import { parseWorkspaceSeed, parseWorkflowDocument, type ParsedWorkflowInput, type WorkflowInputDocument } from './advanced-workflow-schema';

const workflowNamespace = canonicalizeNamespace('recovery:stress:lab:advanced-workflow');

export type WorkflowPluginKind =
  | 'stress-lab/input-collector'
  | 'stress-lab/shape-builder'
  | 'stress-lab/plan-composer'
  | 'stress-lab/simulator'
  | 'stress-lab/reporter'
  | 'stress-lab/finalizer';

export const ADVANCED_WORKFLOW_PLUGIN_KINDS = [
  'stress-lab/input-collector',
  'stress-lab/shape-builder',
  'stress-lab/plan-composer',
  'stress-lab/simulator',
  'stress-lab/reporter',
  'stress-lab/finalizer',
] as const satisfies readonly WorkflowPluginKind[];

type AdvancedPluginConfig = {
  readonly tenantId: string;
  readonly requestId: string;
  readonly stageOrder: readonly WorkflowStage[];
  readonly mode: WorkflowMode;
};

type PluginDefinitionFor<TInput, TOutput, TKind extends WorkflowPluginKind> = PluginDefinition<
  TInput,
  TOutput,
  AdvancedPluginConfig,
  TKind
>;

type PluginDependencyMap = {
  readonly inputCollector: readonly ['dep:recovery:stress:lab'];
  readonly shapeBuilder: readonly ['dep:recovery:stress:lab:input-collector'];
  readonly planner: readonly ['dep:recovery:stress:lab:shape-builder'];
  readonly simulator: readonly ['dep:recovery:stress:lab:plan-composer'];
  readonly reporter: readonly ['dep:recovery:stress:lab:simulator'];
  readonly finalizer: readonly ['dep:recovery:stress:lab:reporter'];
};

const pluginDependencies: PluginDependencyMap = {
  inputCollector: ['dep:recovery:stress:lab'] as const,
  shapeBuilder: ['dep:recovery:stress:lab:input-collector'] as const,
  planner: ['dep:recovery:stress:lab:shape-builder'] as const,
  simulator: ['dep:recovery:stress:lab:plan-composer'] as const,
  reporter: ['dep:recovery:stress:lab:simulator'] as const,
  finalizer: ['dep:recovery:stress:lab:reporter'] as const,
};

export const ADVANCED_WORKFLOW_PLUGIN_MANIFEST = new Map<WorkflowPluginKind, {
  readonly kind: WorkflowPluginKind;
  readonly version: string;
  readonly active: boolean;
  readonly manifestId: string;
  readonly createdAt: string;
}>();

const makeManifestEntry = async <TKind extends WorkflowPluginKind>(kind: TKind, seed: number) => ({
  kind,
  version: `${seed}.0.0`,
  active: seed % 2 === 0,
  manifestId: `${workflowNamespace}::${kind}::${seed}`,
  createdAt: new Date().toISOString(),
});

export const buildAdvancedWorkflowManifest = async () =>
  Promise.all(ADVANCED_WORKFLOW_PLUGIN_KINDS.map((kind, index) => makeManifestEntry(kind, index)));

export const enrichManifest = async (): Promise<void> => {
  const raw = await buildAdvancedWorkflowManifest();
  for (const entry of raw) {
    ADVANCED_WORKFLOW_PLUGIN_MANIFEST.set(entry.kind, entry);
  }
};

const workspaceTag = <TStage extends WorkflowStage>(stage: TStage): `advanced-workflow#${TStage}#event` =>
  `advanced-workflow#${stage}#event`;

const buildPlugin = <
  TKind extends WorkflowPluginKind,
  TInput,
  TOutput,
>(
  kind: TKind,
  name: string,
  dependencies: readonly PluginDependency[],
  run: (
    context: PluginContext<AdvancedPluginConfig>,
    input: TInput,
  ) => Promise<PluginResult<TOutput>>,
): PluginDefinitionFor<TInput, TOutput, TKind> =>
  buildPluginDefinition<TKind, TInput, TOutput, AdvancedPluginConfig>(workflowNamespace, kind, {
    name,
    version: buildPluginVersion(1, 0, 0),
    tags: [kind, `${workflowNamespace}:${name}`],
    dependencies,
    pluginConfig: {
      tenantId: 'tenant:recovery-stress-lab',
      requestId: `${kind}:${name}`,
      stageOrder: WORKFLOW_STAGES as readonly WorkflowStage[],
      mode: 'adaptive',
    },
    run,
  }) as PluginDefinitionFor<TInput, TOutput, TKind>;

const collectClassBuckets = (signals: readonly RecoverySignal[]) => {
  const counts = new Map<RecoverySignal['class'], number>();
  for (const signal of signals) {
    counts.set(signal.class, (counts.get(signal.class) ?? 0) + 1);
  }
  return collectIterable(mapIterable(counts.entries(), ([className, count]) => ({ className, count })));
};

const inferRanking = (workspace: WorkflowWorkspaceSeed) => {
  const rankedSignals = topSignals(workspace);
  const entries: { runbookId: CommandRunbookId; score: number }[] = [];
  for (let index = 0; index < rankedSignals.length; index++) {
    const runbook = workspace.runbooks[index % workspace.runbooks.length];
    const signal = rankedSignals[index];
    const score =
      (signal.severity === 'critical' ? 110 : signal.severity === 'high' ? 90 : signal.severity === 'medium' ? 70 : 40)
      + index;
    if (runbook) {
      entries.push({ runbookId: runbook.id, score });
    }
  }
  return collectIterable(
    mapIterable(entries, (entry) => ({
      runbookId: entry.runbookId,
      score: entry.score,
    })),
  ).sort((left, right) => right.score - left.score);
};

const buildRunbooks = (workspace: WorkflowWorkspaceSeed): readonly CommandRunbook[] =>
  workspace.runbooks.map((entry, index) => ({
    id: entry.id,
    tenantId: workspace.tenantId,
    name: entry.runbookTitle,
    description: `derived:${entry.runbookTitle}`,
    steps: [],
    ownerTeam: `advanced-${index % 4}`,
    cadence: {
      weekday: index % 7,
      windowStartMinute: 15 + (index % 4) * 10,
      windowEndMinute: 30 + (index % 3) * 15,
    },
  }));

const toPlanDependencies = (topology: WorkflowTopology) => ({
  nodes: topology.nodes,
  edges: topology.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    weight: edge.weight,
    payload: {
      fromCriticality: edge.weight,
      toCriticality: edge.weight,
    },
  })),
});

export const inputCollectorPlugin = buildPlugin(
  'stress-lab/input-collector',
  'advanced-workflow-input',
  pluginDependencies.inputCollector,
  async (_context, input: WorkflowInputEnvelope) => {
    const selectedSignals = topSignals(input.payload.workspace);
    return {
      ok: true,
      value: {
        runId: input.runId,
        workspaceTenantId: input.workspaceTenantId,
        startedAt: new Date().toISOString(),
        stage: 'shape',
        route: stageEnvelopeRoute('shape'),
        tag: workspaceTag('shape'),
        payload: {
          workspace: input.payload.workspace,
          selectedSignals,
          topology: buildAdvancedTopologyGraph(input.payload.workspace),
          signalBuckets: collectClassBuckets(selectedSignals),
        },
      } satisfies WorkflowShapeEnvelope,
      generatedAt: new Date().toISOString(),
    };
  },
);

export const shapeBuilderPlugin = buildPlugin(
  'stress-lab/shape-builder',
  'advanced-workflow-shape',
  pluginDependencies.shapeBuilder,
  async (_context, input: WorkflowShapeEnvelope) => {
    const ranking = inferRanking(input.payload.workspace);
    const runbooks = buildRunbooks(input.payload.workspace);
    const topology = buildAdvancedTopologyGraph(input.payload.workspace);

    return {
      ok: true,
      value: {
        runId: input.runId,
        workspaceTenantId: input.workspaceTenantId,
        startedAt: new Date().toISOString(),
        stage: 'plan',
        route: stageEnvelopeRoute('plan'),
        tag: workspaceTag('plan'),
        payload: {
          workspace: input.payload.workspace,
          plan: {
            tenantId: input.payload.workspace.tenantId,
            scenarioName: `plan-${input.runId}`,
            schedule: [],
            runbooks,
            dependencies: toPlanDependencies(topology),
            estimatedCompletionMinutes: Math.max(1, ranking.length * 6),
          },
          ranking,
        },
      } satisfies WorkflowPlanEnvelope,
      generatedAt: new Date().toISOString(),
    };
  },
);

export const planComposerPlugin = buildPlugin(
  'stress-lab/plan-composer',
  'advanced-workflow-plan',
  pluginDependencies.planner,
  async (_context, input: WorkflowPlanEnvelope) => {
    const simulation: RecoverySimulationResult = {
      tenantId: input.payload.workspace.tenantId,
      startedAt: new Date().toISOString(),
      endedAt: new Date(Date.now() + 120_000).toISOString(),
      selectedRunbooks: input.payload.ranking.map((entry) => entry.runbookId),
      ticks: [],
      riskScore: Math.max(1, input.payload.ranking.length),
      slaCompliance: Math.max(0, Math.min(1, (100 - input.payload.ranking.length) / 100)),
      notes: input.payload.ranking.map((entry) => `plan:${entry.runbookId}`),
    };

    return {
      ok: true,
      value: {
        runId: input.runId,
        workspaceTenantId: input.workspaceTenantId,
        startedAt: new Date().toISOString(),
        stage: 'simulate',
        route: stageEnvelopeRoute('simulate'),
        tag: workspaceTag('simulate'),
        payload: {
          workspace: input.payload.workspace,
          simulation,
          riskEnvelope: {
            riskScore: input.payload.ranking.length,
            sla: 100 - input.payload.ranking.length,
          },
        },
      } satisfies WorkflowSimulationEnvelope,
      generatedAt: new Date().toISOString(),
    };
  },
);

export const recommendationPlugin = buildPlugin(
  'stress-lab/simulator',
  'advanced-workflow-simulator',
  pluginDependencies.simulator,
  async (_context, input: WorkflowSimulationEnvelope) => {
    const recommendations: readonly RecommendationRecord[] = input.payload.simulation.selectedRunbooks
      .slice(0, 5)
      .map((runbookId, index) => ({
        runbookId,
        reason: `confidence:${100 - index * 9}`,
      }));

    const simulationSummary = summarizeExecutionResult({
      runId: input.runId,
      tenantId: input.payload.workspace.tenantId,
      stages: [
        {
          stage: 'simulate',
          route: stageEnvelopeRoute('simulate'),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          elapsedMs: 6,
        },
      ],
      traces: [],
      stageSummary: {
        'stage:simulate': {
          index: 0,
          stage: 'simulate',
          events: ['risk', 'sla'],
        },
      },
      workspace: input.payload.workspace,
      simulation: input.payload.simulation,
      plan: null,
      recommendations: [],
    });

    return {
      ok: true,
      value: {
        runId: input.runId,
        workspaceTenantId: input.workspaceTenantId,
        startedAt: new Date().toISOString(),
        stage: 'recommend',
        route: stageEnvelopeRoute('recommend'),
        tag: workspaceTag('recommend'),
        payload: {
          workspace: input.payload.workspace,
          recommendations,
          summary: `${simulationSummary.route}::${simulationSummary.signalCount}`,
        },
      } satisfies WorkflowRecommendationEnvelope,
      generatedAt: new Date().toISOString(),
    };
  },
);

export const reportPlugin = buildPlugin(
  'stress-lab/reporter',
  'advanced-workflow-reporter',
  pluginDependencies.reporter,
  async (_context, input: WorkflowRecommendationEnvelope) => {
    const stages: readonly WorkflowExecutionStage[] = [
      {
        stage: 'recommend',
        route: stageEnvelopeRoute('recommend'),
        startedAt: new Date().toISOString(),
        finishedAt: new Date(Date.now() + 11).toISOString(),
        elapsedMs: 11,
      },
      {
        stage: 'report',
        route: stageEnvelopeRoute('report'),
        startedAt: new Date().toISOString(),
        finishedAt: new Date(Date.now() + 22).toISOString(),
        elapsedMs: 11,
      },
    ];

    const traces: readonly WorkflowExecutionTrace[] = collectIterable(
      mapIterable(input.payload.recommendations, (entry, index) => ({
        sequence: index,
        stage: 'recommend',
        pluginId: 'advanced-workflow-reporter',
        ok: true,
        message: `${entry.runbookId}:${entry.reason}`,
      })),
    );

    return {
      ok: true,
      value: {
        runId: input.runId,
        workspaceTenantId: input.workspaceTenantId,
        startedAt: new Date().toISOString(),
        stage: 'report',
        route: stageEnvelopeRoute('report'),
        tag: workspaceTag('report'),
        payload: {
          workspace: input.payload.workspace,
          simulation: null,
          plan: null,
          stages,
          traces,
          topSignals: input.payload.workspace.signals.map((signal) => signal.id as RecoverySignalId),
          selectedBands: {
            baseline: input.payload.workspace.requestedBand,
            final: input.payload.workspace.requestedBand,
            drift: Math.max(0, input.payload.workspace.signals.length - input.payload.recommendations.length),
          },
          recommendations: input.payload.recommendations,
        },
      } satisfies WorkflowReportEnvelope,
      generatedAt: new Date().toISOString(),
    };
  },
);

export const finalizePlugin = buildPlugin(
  'stress-lab/finalizer',
  'advanced-workflow-finalizer',
  pluginDependencies.finalizer,
  async (_context, input: WorkflowReportEnvelope) => {
    const summary = workspaceMeta(input.payload.workspace);

    return {
      ok: true,
      value: {
        runId: input.runId,
        workspaceTenantId: input.workspaceTenantId,
        startedAt: new Date().toISOString(),
        stage: 'finalize',
        route: stageEnvelopeRoute('finalize'),
        tag: workspaceTag('finalize'),
        payload: {
          ...input.payload,
          finalizedAt: new Date().toISOString(),
          diagnostics: [`tenant=${summary.tenant}`, `runbooks=${summary.runbookCount}`, `targets=${summary.targetCount}`],
        },
      } satisfies WorkflowFinalizeEnvelope,
      generatedAt: new Date().toISOString(),
    };
  },
);

export const ADVANCED_WORKFLOW_CHAIN = [
  inputCollectorPlugin,
  shapeBuilderPlugin,
  planComposerPlugin,
  recommendationPlugin,
  reportPlugin,
  finalizePlugin,
] as const;

export type AdvancedWorkflowPluginChain = typeof ADVANCED_WORKFLOW_CHAIN;

export const buildAdvancedWorkflowChain = (): AdvancedWorkflowPluginChain => [...ADVANCED_WORKFLOW_CHAIN];

export const collectPluginKinds = (): readonly WorkflowPluginKind[] =>
  collectIterable(mapIterable(ADVANCED_WORKFLOW_CHAIN, (entry) => entry.kind));

export const mapPluginTrace = (
  chain: readonly PluginDefinition<
    unknown,
    unknown,
    AdvancedPluginConfig,
    WorkflowPluginKind
  >[],
): readonly { readonly id: string; readonly kind: WorkflowPluginKind }[] =>
  collectIterable(
    mapIterable(chain, (entry, index) => ({
      id: `${index}:${String(entry.id)}`,
      kind: entry.kind,
    })),
  );

export const parseWorkspaceInput = async (
  document: WorkflowInputDocument | WorkflowWorkspaceSeed | string | ParsedWorkflowInput,
): Promise<WorkflowWorkspaceSeed> => {
  if (typeof document === 'string') {
    const parsed = parseWorkspaceSeed(document);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.value;
  }

  if (typeof document === 'object' && document !== null && 'workspace' in document) {
    const parsed = parseWorkspaceSeed(document);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.value;
  }

  return document as WorkflowWorkspaceSeed;
};
