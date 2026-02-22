import type { Brand } from '@shared/core';
import type { RecoveryConstraint, RecoveryProgram, RecoveryRunState, RecoveryStep } from './types';

export type RecoveryLane = 'control-plane' | 'data-plane' | 'security' | 'observability' | 'customer-facing';

export interface StrategyStepAllocation {
  readonly lane: RecoveryLane;
  readonly stepId: string;
  readonly command: string;
  readonly parallelizable: boolean;
  readonly maxRetries: number;
}

export interface StrategyLaneMetrics {
  readonly lane: RecoveryLane;
  readonly commandCount: number;
  readonly totalTimeoutMs: number;
  readonly avgApprovals: number;
}

export interface StrategyRunReport {
  readonly runId: RecoveryRunState['runId'];
  readonly score: number;
  readonly activeLanes: readonly RecoveryLane[];
  readonly hotspots: readonly string[];
  readonly metrics: readonly StrategyLaneMetrics[];
}

export interface StrategyPlanEnvelope {
  readonly program: RecoveryProgram;
  readonly constraints: readonly RecoveryConstraint[];
  readonly allocations: readonly StrategyStepAllocation[];
  readonly laneCount: number;
}

const laneKeywords: Record<RecoveryLane, readonly string[]> = {
  'control-plane': ['dns', 'route', 'gateway', 'policy', 'ingress'],
  'data-plane': ['db', 'cache', 's3', 'storage', 'replica'],
  security: ['iam', 'firewall', 'token', 'acl', 'certificate'],
  observability: ['trace', 'metric', 'log', 'telemetry', 'alert'],
  'customer-facing': ['api', 'endpoint', 'frontend', 'service'],
};

const inferLaneFromStep = (step: RecoveryStep): RecoveryLane => {
  const command = step.command.toLowerCase();
  for (const [lane, tokens] of Object.entries(laneKeywords) as readonly [RecoveryLane, readonly string[]][]) {
    if (tokens.some((token) => command.includes(token))) {
      return lane;
    }
  }
  return 'customer-facing';
};

export const buildStrategyAllocation = (program: RecoveryProgram): readonly StrategyStepAllocation[] =>
  program.steps.map((step) => ({
    lane: inferLaneFromStep(step),
    stepId: step.id,
    command: step.command,
    parallelizable: step.requiredApprovals <= 1,
    maxRetries: Math.max(1, Math.floor(step.timeoutMs / 5_000)),
  }));

export const summarizeLane = (allocations: readonly StrategyStepAllocation[]): readonly StrategyLaneMetrics[] => {
  const accumulator = new Map<RecoveryLane, { commandCount: number; totalTimeoutMs: number; avgApprovals: number; totalApprovals: number }>();

  for (const allocation of allocations) {
    const current = accumulator.get(allocation.lane) ?? {
      commandCount: 0,
      totalTimeoutMs: 0,
      totalApprovals: 0,
      avgApprovals: 0,
    };

    const nextApprovals = current.totalApprovals + allocation.maxRetries;
    const nextCommandCount = current.commandCount + 1;
    accumulator.set(allocation.lane, {
      commandCount: nextCommandCount,
      totalTimeoutMs: current.totalTimeoutMs + 30_000,
      totalApprovals: nextApprovals,
      avgApprovals: nextApprovals / nextCommandCount,
    });
  }

  return Array.from(accumulator.entries()).map(([lane, value]) => ({
    lane,
    commandCount: value.commandCount,
    totalTimeoutMs: value.totalTimeoutMs,
    avgApprovals: Number(value.avgApprovals.toFixed(2)),
  }));
};

export const buildPlanEnvelope = (program: RecoveryProgram): StrategyPlanEnvelope => ({
  program,
  constraints: program.constraints,
  allocations: buildStrategyAllocation(program),
  laneCount: new Set(buildStrategyAllocation(program).map((entry) => entry.lane)).size,
});

export const hotspotFromProgram = (program: RecoveryProgram): readonly string[] => {
  return buildStrategyAllocation(program)
    .filter((entry) => !entry.parallelizable || entry.maxRetries >= 3)
    .map((entry) => `${entry.lane}:${entry.command}`);
};

export const buildStrategyReport = (run: RecoveryRunState, program: RecoveryProgram): StrategyRunReport => {
  const allocations = buildStrategyAllocation(program);
  const metrics = summarizeLane(allocations);
  const laneSet = new Set(allocations.map((allocation) => allocation.lane));
  const scoreBase = 100;
  const complexityPenalty = program.steps.length;
  const constraintPenalty = program.constraints.reduce((sum, constraint) => sum + constraint.threshold, 0);
  const score = Math.max(0, scoreBase - Math.floor(complexityPenalty * 2 + constraintPenalty));

  return {
    runId: run.runId,
    score,
    activeLanes: [...laneSet],
    hotspots: hotspotFromProgram(program),
    metrics,
  };
};

export const isBlockingConstraint = (constraints: readonly RecoveryConstraint[]): boolean => {
  return constraints.some((constraint) => constraint.threshold < 10);
};

export const summarizeConstraint = (constraints: readonly RecoveryConstraint[]): string => {
  if (constraints.length === 0) {
    return 'none';
  }
  return constraints.map((constraint) => `${constraint.name}:${constraint.operator}${constraint.threshold}`).join(',');
};

export type StrategyTenant = Brand<string, 'TenantId'>;
