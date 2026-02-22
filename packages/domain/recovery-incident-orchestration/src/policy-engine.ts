import type {
  IncidentId,
  IncidentRecord,
  IncidentSignal,
  IncidentPlan,
  RecoveryRoute,
  RecoveryRouteNode,
  WorkItemId,
  RouteBuildOptions,
} from './types';
import {
  validateIncidentRecord,
  validatePlanRoute,
  validateRun,
  validateEvent,
} from './validators';
import { createPlan, routeExecutionBatches, topologicalOrder } from './planner';

export interface IncidentSeveritySignal {
  readonly incidentId: IncidentId;
  readonly weightedSignals: readonly {
    readonly name: string;
    readonly value: number;
    readonly normalizedValue: number;
    readonly overweighted: boolean;
  }[];
  readonly compositeScore: number;
}

export interface PolicyConstraint {
  readonly kind: 'risk' | 'duration' | 'dependency' | 'parallelism';
  readonly threshold: number;
  readonly observed: number;
  readonly passed: boolean;
  readonly reasons: readonly string[];
}

export interface PolicyExecutionProfile {
  readonly planId: IncidentPlan['id'];
  readonly incidentId: IncidentId;
  readonly constraintCount: number;
  readonly passingConstraints: number;
  readonly riskProfile: IncidentSeveritySignal;
  readonly constraints: readonly PolicyConstraint[];
  readonly routeLength: number;
  readonly batchCount: number;
  readonly criticalPath: number;
}

export interface SloTarget {
  readonly incidentId: IncidentId;
  readonly maxRisk: number;
  readonly maxRouteLength: number;
  readonly maxBatchCount: number;
  readonly maxCriticalPathMinutes: number;
}

export interface PolicyDecision {
  readonly approved: boolean;
  readonly reasons: readonly string[];
  readonly score: number;
  readonly canAutoApprove: boolean;
}

const normalize = (value: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(4));
};

const signalWeight = (signal: IncidentSignal): number => {
  if (signal.threshold <= 0) {
    return signal.value;
  }
  return signal.value / signal.threshold;
};

export const buildSeveritySignal = (incident: IncidentRecord): IncidentSeveritySignal => {
  const weightedSignals = incident.signals.map((signal) => {
    const normalizedValue = normalize(signalWeight(signal));
    return {
      name: signal.name,
      value: signal.value,
      normalizedValue,
      overweighted: normalizedValue > 0.75,
    };
  });

  const score = weightedSignals.reduce((sum, signal) => sum + signal.normalizedValue, 0);
  const divisor = Math.max(1, weightedSignals.length);

  return {
    incidentId: incident.id,
    weightedSignals,
    compositeScore: Number((score / divisor).toFixed(4)),
  };
};

const buildRiskConstraint = (incident: IncidentRecord, target: SloTarget): PolicyConstraint => {
  const normalized = buildSeveritySignal(incident);
  return {
    kind: 'risk',
    threshold: target.maxRisk,
    observed: normalized.compositeScore,
    passed: normalized.compositeScore <= target.maxRisk,
    reasons: normalized.compositeScore > target.maxRisk
      ? [`risk score ${normalized.compositeScore} exceeds ${target.maxRisk}`]
      : [],
  };
};

const buildDurationConstraint = (plan: IncidentPlan, target: SloTarget): PolicyConstraint => {
  const estimatedMinutes = plan.route.nodes.reduce((sum, node) => sum + node.play.timeoutMinutes, 0);
  return {
    kind: 'duration',
    threshold: target.maxCriticalPathMinutes,
    observed: estimatedMinutes,
    passed: estimatedMinutes <= target.maxCriticalPathMinutes,
    reasons: estimatedMinutes > target.maxCriticalPathMinutes
      ? [`duration ${estimatedMinutes}m exceeds ${target.maxCriticalPathMinutes}m`]
      : [],
  };
};

const buildDependencyConstraint = (route: RecoveryRoute): PolicyConstraint => {
  const order = topologicalOrder(route);
  return {
    kind: 'dependency',
    threshold: route.nodes.length,
    observed: new Set(order).size,
    passed: order.length === route.nodes.length,
    reasons: order.length === route.nodes.length
      ? []
      : [`resolved ${order.length}/${route.nodes.length} nodes`],
  };
};

const estimateCriticalPath = (route: RecoveryRoute): number => {
  const byId = new Map<WorkItemId, RecoveryRouteNode>();
  for (const node of route.nodes) {
    byId.set(node.id, node);
  }

  let depth = 0;
  const sorted = topologicalOrder(route);
  for (const node of sorted) {
    const entry = byId.get(node);
    if (entry) {
      depth += Math.max(1, Math.ceil(entry.play.timeoutMinutes / 10));
    }
  }
  return Math.max(1, depth);
};

const buildParallelismConstraint = (
  route: RecoveryRoute,
  target: SloTarget,
  options: Partial<RouteBuildOptions> = {},
): PolicyConstraint => {
  const batchSize = options.batchSize ?? 2;
  const batches = routeExecutionBatches(route, batchSize);
  return {
    kind: 'parallelism',
    threshold: target.maxBatchCount,
    observed: batches.length,
    passed: batches.length <= target.maxBatchCount,
    reasons:
      batches.length > target.maxBatchCount
        ? [`parallelism batches ${batches.length} exceeds ${target.maxBatchCount}`]
        : [],
  };
};

export const evaluatePolicy = (
  incident: IncidentRecord,
  seed: string,
  target: SloTarget,
  options: Partial<RouteBuildOptions> = {},
): PolicyExecutionProfile => {
  const recordValidation = validateIncidentRecord(incident);
  if (!recordValidation.valid) {
    throw new Error(`invalid incident ${incident.id}: ${recordValidation.issues.join(',')}`);
  }

  const plan = createPlan(incident, seed, options);
  const routeValidation = validatePlanRoute(plan.route, String(plan.id));
  if (!routeValidation.valid) {
    throw new Error(`invalid route for ${plan.id}: ${routeValidation.issues.join(',')}`);
  }

  const constraints = [
    buildRiskConstraint(incident, target),
    buildDurationConstraint(plan, target),
    buildDependencyConstraint(plan.route),
    buildParallelismConstraint(plan.route, target, options),
  ];

  const passingConstraints = constraints.filter((entry) => entry.passed).length;

  return {
    planId: plan.id,
    incidentId: incident.id,
    constraintCount: constraints.length,
    passingConstraints,
    riskProfile: buildSeveritySignal(incident),
    constraints,
    routeLength: plan.route.nodes.length,
    batchCount: routeExecutionBatches(plan.route, options.batchSize ?? 2).length,
    criticalPath: estimateCriticalPath(plan.route),
  };
};

export const policyDecision = (profile: PolicyExecutionProfile): PolicyDecision => {
  const failed = profile.constraints.filter((constraint) => !constraint.passed);
  const reasons = failed.flatMap((entry) => entry.reasons);
  const score = Number((profile.passingConstraints / profile.constraintCount).toFixed(4));
  const autoApprove = reasons.length === 0 && profile.routeLength <= 12 && profile.batchCount <= 10;
  return {
    approved: reasons.length === 0,
    reasons,
    score,
    canAutoApprove: autoApprove,
  };
};

export const validateRunForPolicy = (run: IncidentPlan['route']['nodes'][number]): boolean => {
  const candidate = {
    id: `${String(run.id)}-health` as any,
    planId: run.id as any,
    nodeId: run.id,
    state: 'done' as const,
    startedAt: new Date().toISOString(),
    output: { command: run.play.command },
  };

  return validateRun(candidate).valid && validateEvent({
    id: `${String(run.id)}:event` as unknown as string,
    incidentId: run.id,
    type: 'plan_added',
    details: { runId: String(run.id) },
    createdAt: new Date().toISOString(),
  } as any).valid;
};
