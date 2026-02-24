import { randomUUID } from 'crypto';

import {
  CONSTELLATION_PHASE_ORDER,
} from './command-constellation-types';
import type {
  ConstellationTenant,
  ConstellationExecutionResult,
  ConstellationOrchestratorInput,
  ConstellationOrchestratorOutput,
  ConstellationOrchestrationPlan,
  ConstellationPluginContextState,
  ConstellationRunId,
  ConstellationSignalEnvelope,
  ConstellationPluginEvent,
  ConstellationTelemetryPoint,
  ConstellationStageId,
} from './command-constellation-types';
import { isHighRiskPlan, normalizeTelemetry } from './command-constellation-types';
import { buildConstellationGraph, renderGraphRuntime, summarizeExecution, summarizeResult } from './command-constellation-graph';
import { ConstellationDisposalScope, ConstellationPluginRegistry, seedPlugins, type ConstellationPluginContext, type ConstellationRunSummary } from './command-constellation-registry';
import type { CommandPlan, CommandPlanStep, CommandWindow } from './types';

export interface RunContext extends ConstellationPluginContextState {
  readonly startAt: string;
}

type SeedPlugins = Awaited<(typeof seedPlugins)>;

const toDependencyStageId = (commandId: string): ConstellationStageId => `cmd:${commandId}` as ConstellationStageId;

type OrchestratorState = {
  readonly runId: ConstellationRunId;
  readonly registry: ConstellationPluginRegistry<SeedPlugins>;
  readonly telemetry: readonly ConstellationTelemetryPoint[];
};

const toEventName = (index: number): ConstellationPluginEvent =>
  `constellation:event:${CONSTELLATION_PHASE_ORDER[index] ?? 'review'}` as ConstellationPluginEvent;

const buildContext = ({ tenant, plan }: ConstellationOrchestratorInput): RunContext => {
  const telemetry = normalizeTelemetry(
    plan.stages.map((stage, index) => ({
      at: new Date(Date.now() + index * 1000).toISOString(),
      stage: stage.id,
      risk: stage.commandIds.length / Math.max(plan.commands.length, 1),
      signal: {
        key: `stage:${stage.id}`,
        value: stage.commandIds.length,
        confidence: 0.5,
      },
    })),
  );

  return {
    tenant,
    runId: plan.runId,
    plan,
    telemetry,
    startAt: new Date().toISOString(),
  };
};

const dispatch = async <TPlan extends ConstellationOrchestrationPlan>(
  state: OrchestratorState,
  event: ConstellationPluginEvent,
  plan: TPlan,
  output: ConstellationRunSummary,
): Promise<ConstellationRunSummary> => {
  const context: ConstellationPluginContext<ConstellationPluginContextState> = {
    tenant: plan.tenant,
    runId: plan.runId,
    phase: plan.phase,
    state: {
      tenant: plan.tenant,
      plan,
      runId: plan.runId,
      telemetry: state.telemetry,
    },
    trace: ['orchestrator:dispatch', event],
    run: async () => Promise.resolve(),
    emit: (signalEvent, payload): ConstellationSignalEnvelope => ({
      tenant: plan.tenant,
      runId: plan.runId,
      planId: plan.id,
      stageId: plan.stageIds[0] ?? ('seed-stage' as TPlan['stageIds'][number]),
      event: signalEvent,
      payload,
    }),
  };

  const next = await state.registry.runEvent(context, event, {
    planId: plan.id,
    stageIds: plan.stageIds,
    tenant: plan.tenant,
  });

  return {
    events: [...output.events, ...next.events],
    outputs: [...output.outputs, ...next.outputs],
  };
};

const buildCommandPlanFromPlan = (tenant: ConstellationTenant, plan: ConstellationOrchestrationPlan): CommandPlan => {
  const steps: CommandPlanStep[] = plan.commands.map((command, index) => ({
    commandId: command.id,
    commandTitle: command.title,
    sequence: index,
    canRunWithParallelism: 1,
    status: 'planned',
    scheduledWindow: {
      id: `window:${plan.id}:${command.id}` as CommandWindow['id'],
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30_000).toISOString(),
      preferredClass: 'compute',
      maxConcurrent: 1,
    } satisfies CommandWindow,
    rationale: `phase:${plan.phase}`,
  }));

  const totalRisk = plan.commands.reduce((accumulator, command) => accumulator + command.riskWeight, 0);

  return {
    id: randomUUID() as CommandPlan['id'],
    tenantId: tenant,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requestedBy: tenant,
    steps: steps as readonly CommandPlanStep[],
    totalRisk,
    coverage: steps.length,
    blockedReasons: [],
  };
};

export const runConstellationOrchestrator = async ({
  tenant,
  plan,
  overrides = {},
}: ConstellationOrchestratorInput): Promise<ConstellationOrchestratorOutput> => {
  const seed = await seedPlugins;
  const registry = new ConstellationPluginRegistry(seed);
  const telemetry = buildContext({ tenant, plan }).telemetry;

  const dependencyMap = Object.fromEntries(
    plan.stages.map((stage) => [stage.id, stage.commandIds.map(toDependencyStageId)]),
  ) as Record<string, readonly ConstellationStageId[]>;

  const graph = buildConstellationGraph(plan.stages, dependencyMap);
  const runtime = renderGraphRuntime(plan, {
    strict: Boolean(overrides.keepArtifacts),
    maxHops: 16,
  });
  void graph;
  void runtime;
  const state: OrchestratorState = {
    runId: plan.runId,
    registry,
    telemetry,
  };

  const phases = CONSTELLATION_PHASE_ORDER.map((_phase, index) => toEventName(index));
  const history = { events: [], outputs: [] } satisfies ConstellationRunSummary;

  const summary = await phases.reduce<Promise<ConstellationRunSummary>>(async (carry, phase) => {
    const current = await carry;
    return dispatch(state, phase, plan, current);
  }, Promise.resolve(history));

  const simulation = await registry.simulate(plan);
  const syntheticSignal: ConstellationSignalEnvelope = {
    tenant: plan.tenant,
    runId: plan.runId,
    planId: plan.id,
    stageId: plan.stageIds[0] ?? ('seed-stage' as ConstellationOrchestrationPlan['stageIds'][number]),
    event: 'constellation:event:simulate',
    payload: {
      count: plan.commands.length,
      simulated: true,
    },
  };

  using _stack = new ConstellationDisposalScope();
  void _stack;

  const commandPlan = buildCommandPlanFromPlan(tenant, plan);
  const result: ConstellationExecutionResult = {
    runId: plan.runId,
    planId: plan.id,
    artifacts: simulation.artifacts,
    stages: simulation.stages,
    createdAt: new Date().toISOString(),
    completedAt: overrides.phaseWindow ? new Date(Date.now() + overrides.phaseWindow * 1000).toISOString() : undefined,
    plans: [commandPlan, ...simulation.plans],
  };

  const summaryContext = buildContext({ tenant, plan });
  const summaryText = summarizeResult({
    context: summaryContext,
    graph: runtime,
    result,
  });
  const signalSummary = summarizeExecution({ result, graph: runtime });

  return {
    summary: `${summaryText} | ${signalSummary}`,
    result,
    signals: [...summary.events, ...simulation.signals, syntheticSignal],
    trace: [isHighRiskPlan(plan) ? 'high-risk' : 'low-risk', `commands:${result.plans.length}`],
  };
};
