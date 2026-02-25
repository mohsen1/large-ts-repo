import { chunkBy, collectIterable } from '@shared/recovery-synthesis-runtime';
import type { NoInfer } from '@shared/type-level';

import type {
  SynthesisWorkspace,
  SynthesisWorkspaceEvent,
  SynthesisSimulationSnapshot,
} from './synthesis-types';
import type { ScenarioConstraint, ScenarioPlan, SimulationResult, ScenarioCommand } from './types';
import { asPercent, asMillis } from './types';
import {
  collectByCategory,
  parseTimelineEvents,
  foldSlots,
  createTenant,
  createRunToken,
  type TimelineMetric,
  type WorkspaceEventCategory,
} from './synthesis-advanced-types';
import { ConstraintGraph } from './synthesis-constraint-graph';

type DimensionCounter = {
  [K in WorkspaceEventCategory]: number;
};

type BucketTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [{ readonly [K in keyof T & number]: `bucket:${K}` }[0], Head, ...BucketTuple<Tail>]
  : readonly [];

interface PlanDigest {
  readonly planId: string;
  readonly commandCount: number;
  readonly expectedFinishMs: number;
  readonly score: number;
}

export interface WorkspaceIntelligence {
  readonly timelineDigest: readonly TimelineMetric[];
  readonly commandRiskScore: number;
  readonly candidateDensity: number;
  readonly warnings: readonly string[];
}

interface ConstraintWindow {
  readonly commandCount: number;
  readonly warningCount: number;
}

export interface WindowedWorkload {
  readonly window: string;
  readonly commandCount: number;
  readonly commandIds: readonly string[];
  readonly warningCount: number;
}

const asWindowId = (index: number): `window.${number}` => `window.${index}`;

const normalizeCommand = (commandId: string): ScenarioCommand => ({
  commandId: commandId as ScenarioCommand['commandId'],
  commandName: `command:${commandId}`,
  targetService: 'adaptive-runtime',
  estimatedDurationMs: asMillis(1000),
  resourceSpendUnits: 1,
  prerequisites: [],
  blastRadius: 0,
});

export const buildPlanDigest = (plan: ScenarioPlan): PlanDigest => ({
  planId: String(plan.planId),
  commandCount: plan.commandIds.length,
  expectedFinishMs: Number(plan.expectedFinishMs),
  score: plan.score,
});

export const rankPlansByDensity = <TPlan extends ScenarioPlan>(
  plans: NoInfer<readonly TPlan[]>,
): readonly TPlan[] => {
  return [...plans].sort((left, right) => right.score - left.score);
};

export const estimateCommandDensity = (commands: readonly ScenarioCommand[]): number => {
  if (commands.length === 0) {
    return 0;
  }

  return commands.reduce((acc, command) => acc + command.resourceSpendUnits, 0) / commands.length;
};

export const summarizeConstraintHealth = (
  constraints: readonly ScenarioConstraint[],
  violations: readonly { readonly severity: ScenarioConstraint['severity'] }[],
): {
  readonly healthy: number;
  readonly degraded: number;
  readonly critical: number;
} => {
  collectByCategory(
    constraints.map((constraint, index) => ({
      kind: index % 2 === 0 ? 'plan' : 'store',
      payload: constraint,
      when: new Date().toISOString(),
      traceId: `trace.summary.${index}` as SynthesisWorkspaceEvent['traceId'],
    })),
  );

  return {
    healthy: constraints.length - violations.length,
    degraded: violations.filter((violation) => violation.severity === 'warning').length,
    critical: violations.filter((violation) => violation.severity === 'error').length,
  };
};

export const buildWindowedWorkload = (
  commands: readonly ScenarioCommand[],
  windowSize = 4,
): readonly WindowedWorkload[] => {
  const windows = chunkBy(commands, windowSize);
  const entries = (function* () {
    let index = 0;
    for (const commandSet of windows) {
      const ids = commandSet.map((command) => command.commandId);
      yield {
        window: asWindowId(index),
        commandCount: ids.length,
        warningCount: 0,
        commandIds: ids,
      };
      index += 1;
    }
  })();

  return collectIterable(entries);
};

export const analyzePlan = (plan: ScenarioPlan): WorkspaceIntelligence => {
  const parsed = parseTimelineEvents(plan.warnings);
  const commandCount = estimateCommandDensity(plan.commandIds.map((id) => normalizeCommand(id)));
  const slots = foldSlots(
    plan.commandIds.map((commandId, index) => ({
      commandId,
      slot: `slot:${index}` as const,
      owner: createTenant(String(index)),
    })),
  );

  return {
    timelineDigest: parsed,
    commandRiskScore: Math.min(1, commandCount / 10),
    candidateDensity: commandCount === 0 ? 0 : Math.max(0, 1 / Math.max(1, plan.commandIds.length)),
    warnings: [
      `runs:${slots.runs.length}`,
      `route:${slots.route}`,
      `tenant:${slots.tenant}`,
      ...plan.warnings,
    ],
  };
};

export const buildSimulationDigest = (
  simulation: SimulationResult,
): readonly { readonly commandCount: number; readonly commandDuration: number }[] => {
  return simulation.frames.map((frame, index) => ({
    commandCount: index + 1,
    commandDuration: Number(frame.finishedAt) + frame.events.length,
  }));
};

export const normalizeWorkspace = (workspace: SynthesisWorkspace): SynthesisWorkspace => ({
  ...workspace,
  timeline: workspace.timeline.map((entry) => ({
    source: entry.source,
    commandOrder: entry.commandOrder,
    warnings: entry.warnings,
  })),
});

export const analyzeWorkspace = (input: {
  readonly workspace: SynthesisWorkspace;
  readonly constraints: readonly ScenarioConstraint[];
}): {
  readonly intelligence: WorkspaceIntelligence;
  readonly planDigest: PlanDigest | undefined;
  readonly warnings: readonly string[];
} => {
  const latestPlan = input.workspace.latestOutput?.plan;
  const planDigest = latestPlan ? buildPlanDigest(latestPlan) : undefined;
  const planCommands = latestPlan ? latestPlan.commandIds.map((commandId) => normalizeCommand(commandId)) : [];
  const windows = buildWindowedWorkload(planCommands);
  const violations = new ConstraintGraph(planCommands, input.constraints).activeViolations(latestPlan?.commandIds ?? []);

  const categoryCounts = collectByCategory(input.workspace.events as readonly SynthesisWorkspaceEvent[]);
  const timelineDigest: TimelineMetric[] = [
    ...parseTimelineEvents(input.workspace.events),
            ...collectIterable(
      (function* () {
        for (const key of Object.keys(categoryCounts) as WorkspaceEventCategory[]) {
          const count = categoryCounts[key];
          yield {
            run: createRunToken(String(latestPlan?.planId ?? 'fallback')),
            route: `route:${key}` as const,
            stageCount: count,
            warningCount: violations.length,
            avgLatencyMs: count > 0 ? count * 7 : 0,
          };
        }
      })(),
    ),
  ];

  const commandDensity = estimateCommandDensity(planCommands);
  const candidateDensity = latestPlan && latestPlan.commandIds.length > 0
    ? 1 / Math.max(1, latestPlan.commandIds.length)
    : 0;

  const counts: DimensionCounter = {
    plan: windows.reduce((sum, entry) => sum + entry.commandCount, 0),
    simulate: latestPlan?.commandIds.length ?? 0,
    govern: violations.length,
    publish: 0,
    store: input.workspace.events.length,
    alert: latestPlan?.warnings.length ?? 0,
  };

  return {
    intelligence: {
      timelineDigest,
      commandRiskScore: Number(asPercent(Math.min(1, commandDensity / 12))),
      candidateDensity,
      warnings: [
        ...Object.entries(counts).map(([metric, value]) => `${metric}:${value}`),
        ...windows.map((window, index) => `window.${index}.warnings:${window.warningCount}`),
        `constraints:${input.constraints.length}`,
      ],
    },
    planDigest,
    warnings: [
      ...new Set([
        ...input.workspace.events.map((event) => event.kind),
        ...input.constraints.map((constraint) => constraint.constraintId),
      ]),
    ],
  };
};

export const correlateTimeline = <T extends readonly unknown[]>(
  values: NoInfer<T>,
): {
  readonly tags: T;
  readonly tuples: BucketTuple<T>;
} => {
  const tuples = values.map((entry) => `bucket:${String(entry)}`) as unknown as BucketTuple<T>;
  return {
    tags: values,
    tuples,
  };
};

export const buildSnapshot = (input: {
  readonly timeline: readonly SynthesisWorkspaceEvent[];
  readonly plan: ScenarioPlan;
  readonly simulation: SimulationResult;
  readonly violations: readonly ScenarioConstraint[];
  readonly readModel: SynthesisSimulationSnapshot['readModel'];
}): {
  readonly totalWarnings: number;
  readonly commandCount: number;
  readonly durationMs: number;
  readonly metrics: Readonly<Record<`metric:${WorkspaceEventCategory}`, number>>;
  readonly timelineDigest: readonly TimelineMetric[];
} => {
  const start = Date.parse(input.simulation.startedAt);
  const end = Date.parse(input.simulation.finishedAt);
  const duration = Number.isFinite(start + end) ? end - start : asMillis(0);

  const metricBuckets = {
    plan: input.plan.commandIds.length,
    simulate: buildSimulationDigest(input.simulation).length,
    govern: Math.floor(input.violations.length / 2),
    store: Math.floor(input.violations.length / 3),
    alert: input.simulation.violations.length,
    publish: 0,
  };

  return {
    totalWarnings: input.plan.warnings.length + input.readModel.candidates.length,
    commandCount: input.simulation.frames.length,
    durationMs: duration,
    metrics: {
      'metric:plan': metricBuckets.plan,
      'metric:simulate': metricBuckets.simulate,
      'metric:govern': metricBuckets.govern,
      'metric:store': metricBuckets.store,
      'metric:publish': metricBuckets.publish,
      'metric:alert': metricBuckets.alert,
    },
    timelineDigest: parseTimelineEvents(input.timeline),
  };
};
