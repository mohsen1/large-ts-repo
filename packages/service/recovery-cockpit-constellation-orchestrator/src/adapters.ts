import {
  ConstellationContext,
  type ConstellationMode,
  type ConstellationNode,
  type ConstellationPlanEnvelope,
  type ConstellationRoute,
  type ConstellationStage,
  type ConstellationTemplateId,
  type PluginTag,
  type PluginRoutePattern,
  type ConstellationTopology,
  newTemplateId,
  newNodeId,
  pluginKindLabelMap,
  type ConstellationPlugin,
  type PluginInput,
  type PluginOutput,
  type PluginExecutionResult,
  pluginInputFingerprint,
  pluginKindKeys,
  pluginEvent,
  type StageOutput,
  type StagePayload,
} from '@domain/recovery-cockpit-constellation-core';
import { toPercent } from '@shared/util';
import type { RecoveryAction, RecoveryPlan, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import { toTimestamp } from '@domain/recovery-cockpit-models';
import { createPlanEnvelope } from '@data/recovery-cockpit-constellation-store';

const STAGES: readonly ConstellationStage[] = ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'];

const routeFor = (stage: ConstellationStage): `route:${ConstellationStage}` => `route:${stage}`;
const tagFor = (stage: ConstellationStage): PluginTag => `tag:${stage}`;
const modeForStage = (stage: ConstellationStage): ConstellationMode =>
  stage === 'execute'
    ? 'execution'
    : stage === 'simulate'
      ? 'simulation'
      : stage === 'recover' || stage === 'sweep'
        ? 'stabilization'
        : 'analysis';

const dependenciesFor = (stage: ConstellationStage): readonly PluginRoutePattern[] => {
  const stageIndex = STAGES.indexOf(stage);
  if (stageIndex <= 0) {
    return [];
  }
  return STAGES.slice(0, stageIndex).map((entry) => `route:${entry}`) as readonly PluginRoutePattern[];
};

const toIso = (date: Date): UtcIsoTimestamp => toTimestamp(date);
const routeMetrics = (stage: ConstellationStage): Record<string, number> => ({ [`bucket:${stage}`]: stage.length * 10 });
const toTopology = (input: StagePayload<ConstellationStage, ConstellationMode>): ConstellationTopology =>
  (input as { topology?: ConstellationTopology }).topology ?? { nodes: [], edges: [] };

const buildEvent = (
  message: string,
  category: 'metric' | 'risk' | 'policy' | 'telemetry' | 'plan',
  tags: readonly string[],
) => ({
  kind: category,
  message,
  timestamp: toIso(new Date()),
  tags,
});

const bootstrapOutput = (topology: ConstellationTopology): StageOutput<'bootstrap', ConstellationMode> => ({
  topology,
  fingerprint: newTemplateId(topology.nodes.length.toString()) as ConstellationTemplateId,
  mode: modeForStage('bootstrap'),
});

const ingestOutput = (topology: ConstellationTopology): StageOutput<'ingest', ConstellationMode> => ({
  nodes: topology.nodes,
  channels: topology.nodes.map((_, index) => `channel:${index}` as const),
});

const synthesizeOutput = (topology: ConstellationTopology): StageOutput<'synthesize', ConstellationMode> => ({
  topology,
  metrics: {
    scores: topology.nodes.map((node, index) => [
      node.stage,
      node.actionCount,
      toIso(new Date(Date.now() - index * 1_000)),
    ]),
    health: Math.max(1, topology.nodes.length) * 11,
  },
});

const validateOutput = (plan: RecoveryPlan): StageOutput<'validate', ConstellationMode> => ({
  isSafe: plan.isSafe,
  violations: plan.audit.map((entry) => entry.actor.id),
  confidence: Math.round(toPercent(plan.slaMinutes, 120)),
});

const simulateOutput = (topology: ConstellationTopology): StageOutput<'simulate', ConstellationMode> => ({
  timeline: topology.nodes.map((node) => ({
    kind: 'metric',
    message: `simulate:${node.nodeId}`,
    timestamp: toIso(new Date()),
    tags: [node.nodeId],
  })),
  score: Math.max(0, topology.nodes.length - 1) * 12,
});

const executeOutput = (plan: RecoveryPlan): StageOutput<'execute', ConstellationMode> => ({
  startedAt: toIso(new Date()),
  estimatedMinutes: plan.actions.length + 1,
  actionsPrepared: plan.actions,
});

const recoverOutput = (topology: ConstellationTopology, plan: RecoveryPlan): StageOutput<'recover', ConstellationMode> => ({
  done: true,
  summary: createPlanEnvelope(plan, topology),
});

const sweepOutput = (plan: RecoveryPlan): StageOutput<'sweep', ConstellationMode> => ({
  done: true,
  checksum: `sweep:${plan.actions.length}`,
  summary: `post:${plan.planId}:${toIso(new Date())}`,
});

const fallbackPlan = (): RecoveryPlan =>
  ({
    version: 1 as never,
    effectiveAt: toIso(new Date()),
    planId: 'plan:fallback' as RecoveryPlan['planId'],
    labels: {
      short: 'fallback',
      long: 'fallback',
      emoji: '🛟',
      labels: ['fallback'],
    },
    mode: 'manual',
    title: 'fallback',
    description: 'synthetic fallback plan',
    actions: [],
    audit: [],
    slaMinutes: 5,
    isSafe: false,
  }) as RecoveryPlan;

const asPlan = (input: StagePayload<ConstellationStage, ConstellationMode>): RecoveryPlan =>
  (input as { plan?: RecoveryPlan }).plan ?? fallbackPlan();

const toRecoveredNode = (plan: RecoveryPlan): readonly ConstellationNode[] =>
  plan.actions.map((action, index) => ({
    nodeId: newNodeId(action.id),
    label: action.command,
    stage: index % 2 === 0 ? 'recover' : 'sweep',
    actionCount: action.expectedDurationMinutes,
    criticality: action.retriesAllowed,
  }));

const toInput = (
  topology: ConstellationTopology,
  stage: ConstellationStage,
  plan: RecoveryPlan,
): PluginInput<ConstellationPlugin> => {
  if (stage === 'bootstrap') {
    return {
      planId: plan.planId,
      scope: 'service',
      mode: modeForStage(stage),
      runbookId: newTemplateId(plan.planId),
    } as PluginInput<ConstellationPlugin>;
  }
  if (stage === 'ingest') {
    return {
      sources: ['sensor'],
      correlationId: plan.planId,
      plan: createPlanEnvelope(plan, topology),
    } as PluginInput<ConstellationPlugin>;
  }
  if (stage === 'synthesize') {
    return {
      actions: plan.actions,
      topology,
      stageHints: ['simulate', 'execute'],
    } as PluginInput<ConstellationPlugin>;
  }
  if (stage === 'validate') {
    return {
      plan,
      checks: ['policy', 'risk'],
    } as PluginInput<ConstellationPlugin>;
  }
  if (stage === 'simulate') {
    return {
      scenarioId: `scenario:${plan.planId}`,
      intensity: plan.actions.length,
      topology,
    } as PluginInput<ConstellationPlugin>;
  }
  if (stage === 'execute') {
    return {
      commandIds: plan.actions.map((action) => action.id),
      runId: `run:${plan.planId}`,
      plan,
      topology,
    } as PluginInput<ConstellationPlugin>;
  }
  if (stage === 'recover') {
    return {
      recoveredNodes: toRecoveredNode(plan),
      timelineAt: toIso(new Date()),
      summaryNotes: ['recovered', 'finalized'],
      plan,
      topology,
    } as PluginInput<ConstellationPlugin>;
  }
  return {
    recoveredNodes: toRecoveredNode(plan),
    timelineAt: toIso(new Date()),
    summaryNotes: ['sweep', 'verify'],
    plan,
    topology,
  } as PluginInput<ConstellationPlugin>;
};

const buildFingerprintPlugin = (
  stage: ConstellationStage,
): Omit<ConstellationPlugin, 'execute'> => ({
  id: `plugin:${stage}`,
  name: pluginKindLabelMap[stage] ?? stage,
  kind: stage,
  tags: [tagFor(stage)],
  route: routeFor(stage),
  mode: modeForStage(stage),
  dependsOn: dependenciesFor(stage),
  enabled: true,
  timeoutMs: 2_000,
});

const buildPluginEventFingerprint = (stage: ConstellationStage, input: StagePayload<ConstellationStage, ConstellationMode>) => {
  const plugin = buildFingerprintPlugin(stage);
  return pluginInputFingerprint(
    {
      ...plugin,
      execute: async () => ({ output: bootstrapOutput({ nodes: [], edges: [] }), events: [], metrics: {} }),
    } as ConstellationPlugin,
    input,
  );
};

const createPlugin = (stage: ConstellationStage): ConstellationPlugin => {
  const base = buildFingerprintPlugin(stage);
  return {
    ...base,
    execute: async (
      input: StagePayload<ConstellationStage, ConstellationMode>,
      context: ConstellationContext,
    ): Promise<PluginExecutionResult<ConstellationStage, ConstellationMode>> => {
      const topology = toTopology(input);
      const output = ((): StageOutput<ConstellationStage, ConstellationMode> => {
        switch (stage) {
          case 'bootstrap':
            return bootstrapOutput(topology);
          case 'ingest':
            return ingestOutput(topology);
          case 'synthesize':
            return synthesizeOutput(topology);
          case 'validate':
            return validateOutput(asPlan(input));
          case 'simulate':
            return simulateOutput(topology);
          case 'execute':
            return executeOutput(asPlan(input));
          case 'recover':
            return recoverOutput(topology, asPlan(input));
          case 'sweep':
            return sweepOutput(asPlan(input));
          default:
            return sweepOutput(asPlan(input));
        }
      })();

      const stageEvents = [
        pluginEvent(`plugin ${stage} running`, 'plan', context.runId, context.correlationId),
        buildEvent(`${stage}:${context.runId}`, 'telemetry', [context.runbookId]),
        buildEvent(buildFingerprintPlugin(stage).id, 'metric', [context.runId]),
        buildEvent(buildPluginEventFingerprint(stage, input), 'plan', [context.correlationId]),
      ];

      return {
        output,
        events: stageEvents,
        metrics: routeMetrics(stage),
      };
    },
    dispose: () => Promise.resolve(undefined),
  };
};

export const buildPlugins = (): readonly ConstellationPlugin[] => STAGES.map((stage) => createPlugin(stage));

export const buildStageInput = (
  stage: ConstellationStage,
  topology: ConstellationTopology,
  plan: RecoveryPlan,
): StagePayload<ConstellationStage, ConstellationMode> =>
  toInput(topology, stage, plan) as StagePayload<ConstellationStage, ConstellationMode>;

export const stageList = STAGES;
