import type { CommandSurfaceId, SurfacePlan, SurfaceRun, SurfaceSignal, SimulationContext, SimulationResult } from './types';
import { buildSurfaceRunId, type RunState, type SurfaceActionTemplate, type SurfaceRunStep } from './types';
import { createPlanGraph, getCriticalPath, getDownstream } from './topology';

export interface BatchWindow {
  readonly index: number;
  readonly commands: readonly SurfaceActionTemplate[];
  readonly expectedDurationMinutes: number;
}

export interface ExecutionPlan {
  readonly planId: SurfacePlan['id'];
  readonly tenant: string;
  readonly totalSteps: number;
  readonly criticalPath: readonly CommandSurfaceId[];
  readonly windows: readonly BatchWindow[];
  readonly estimatedCompletionAt: string;
  readonly estimatedRisk: number;
}

export interface StepSelection {
  readonly runId: SurfaceRun['id'];
  readonly commandIds: readonly CommandSurfaceId[];
  readonly reason: string;
}

const clampPositive = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.round(value);
};

export const buildExecutionPlan = (plan: SurfacePlan): ExecutionPlan => {
  const graph = createPlanGraph(plan);
  const windows: BatchWindow[] = [];
  const byIndex = new Map<number, SurfaceActionTemplate[]>();
  const commandById = new Map<CommandSurfaceId, SurfaceActionTemplate>(plan.commands.map((command) => [command.id, command]));
  const byLevel = new Map<string, number>();

  for (const id of graph.order) {
    const node = graph.nodes.get(id);
    if (!node) continue;
    const level = node.incoming.length === 0 ? 0 : Math.max(
      ...node.incoming.map((incoming) => byLevel.get(incoming) ?? 0),
    ) + 1;
    byLevel.set(id, level);
    const bucket = byIndex.get(level) ?? [];
    byIndex.set(level, [...bucket, commandById.get(id)].filter((entry): entry is SurfaceActionTemplate => Boolean(entry)));
  }

  const sortedLevels = [...byIndex.keys()].sort((left, right) => left - right);
  for (const level of sortedLevels) {
    const commands = byIndex.get(level) ?? [];
    const index = windows.length;
    windows.push({
      index,
      commands,
      expectedDurationMinutes: commands.reduce((sum, command) => sum + command.inputs.reduce(
        (duration, input) => duration + clampPositive(input.expectedDurationMinutes),
        0,
      ), 0),
    });
  }

  const criticalPath = getCriticalPath(graph);
  const maxWindowTime = windows.reduce((total, window) => total + window.expectedDurationMinutes, 0);
  const maxRisk = Math.max(0, ...plan.commands.map((command) => command.inputs.length * 2));
  const completion = new Date(Date.now() + maxWindowTime * 60_000).toISOString();

  return {
    planId: plan.id,
    tenant: plan.surface.tenant,
    totalSteps: plan.commands.length,
    criticalPath,
    windows,
    estimatedCompletionAt: completion,
    estimatedRisk: maxRisk,
  };
};

interface PlanTimelinePoint {
  readonly commandId: CommandSurfaceId;
  readonly rank: number;
  readonly kind: SurfaceActionTemplate['kind'];
  readonly durationMinutes: number;
}

export const toPlanTimeline = (plan: SurfacePlan): readonly PlanTimelinePoint[] => {
  const graph = createPlanGraph(plan);
  return graph.order.map((id) => {
    const command = plan.commands.find((entry) => entry.id === id);
    if (!command) {
      return {
        commandId: id,
        rank: 0,
        kind: 'stabilize',
        durationMinutes: 0,
      };
    }
    const dependents = getDownstream(graph, id).length;
    return {
      commandId: id,
      rank: dependents,
      kind: command.kind,
      durationMinutes: command.inputs.reduce((sum, input) => sum + input.expectedDurationMinutes, 0),
    };
  });
};

export const simulateExecution = (run: SurfaceRun, context: SimulationContext): SimulationResult => {
  const baselineMinutes = run.steps.reduce((sum, step) => {
    const duration = step.finishedAt && step.startedAt
      ? parseTimestampDelta(step.startedAt, step.finishedAt)
      : 5;
    return sum + duration;
  }, 0);

  const remainingSteps = Math.max(0, run.riskScore);
  const projectedSlo = Math.max(context.globalBudgetMinutes - baselineMinutes - remainingSteps, 0);
  const confidence = Math.min(98, Math.max(40, 100 - (run.riskScore * 3)));
  const projectedFinishAt = new Date(context.currentTimestamp)
    .toISOString();

  const projectedSteps = run.steps.slice(0, Math.min(run.steps.length, 8)).map((step, index) => ({
    commandId: step.commandId,
    finishAt: new Date(Date.now() + index * 60_000 * (1 + remainingSteps)).toISOString(),
    confidence: Math.max(10, confidence - index * 5),
  }));

  const highSignalWarnings = run.signals
    .filter((signal) => signal.unit === 'percent' && signal.value > 80)
    .map((signal) => signal.key);

  const warnings = [
    ...highSignalWarnings.map((signal) => ({
      type: 'signal',
      message: `signal ${signal} exceeded 80%`,
      severity: 'medium' as const,
    })),
    {
      type: 'slo',
      message: `remaining budget ${projectedSlo} minutes`,
      severity: projectedSlo < 0 ? ('high' as const) : ('low' as const),
    },
  ];

  return {
    runId: run.id,
    predictedFinishAt: projectedFinishAt,
    predictedRisk: run.riskScore + remainingSteps,
    projectedSteps,
    warnings,
  };
};

export const selectParallelWindow = (
  run: SurfaceRun,
  commands: readonly SurfaceActionTemplate[],
): StepSelection => {
  const eligible = commands.filter((command) =>
    !run.steps.some((step) => step.commandId === command.id),
  );
  const filtered = eligible
    .filter((command) => command.inputs.length > 0)
    .slice(0, run.steps.length ? 2 : 3);
  return {
    runId: run.id,
    commandIds: filtered.map((command) => command.id),
    reason: `selected ${filtered.length} command(s) with readiness confidence`,
  };
};

export const startRunFromPlan = (plan: SurfacePlan, request: { tenant: string; requestedBy: string; scenario: string; }): SurfaceRun => ({
  id: buildSurfaceRunId(plan.id, String(Date.now())),
  tenant: request.tenant,
  planId: plan.id,
  scenario: request.scenario,
  requestedBy: request.requestedBy,
  createdAt: new Date().toISOString(),
  state: 'scheduled',
  steps: [],
  signals: [],
  riskScore: plan.commands.reduce((sum, command) => sum + command.inputs.length, 0),
});

const parseTimestampDelta = (start: string, end: string): number => {
  const startAt = Date.parse(start);
  const endAt = Date.parse(end);
  if (Number.isNaN(startAt) || Number.isNaN(endAt) || endAt <= startAt) {
    return 0;
  }
  return Math.max(1, Math.round((endAt - startAt) / 60_000));
};

export const appendStep = (
  run: SurfaceRun,
  step: Pick<SurfaceRunStep, 'commandId' | 'executor' | 'host' | 'output'>,
): SurfaceRun => {
  const startedAt = new Date().toISOString();
  const nextStep: SurfaceRunStep = {
    ...step,
    at: startedAt,
    state: 'in_flight',
    startedAt,
    output: step.output,
  };
  return {
    ...run,
    state: 'in_flight',
    startedAt: run.startedAt ?? startedAt,
    steps: [...run.steps, nextStep],
    riskScore: run.riskScore + 1,
  };
};
