import {
  type AlertSignal,
  type FabricConstraint,
  type FabricSimulationInput,
  type FabricSimulationResult,
  type FabricPlan,
  type FabricPlanStep,
  defaultFabricConstraint,
  type FabricPolicy,
  type FabricTopology,
  type FabricPolicyResult,
} from './models';
import { computeSignalImpact, summarizeTopology } from './metrics';
import { buildCommandSequence } from './topology';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const toConstraint = (constraint?: Partial<FabricConstraint>): FabricConstraint => {
  const merged: FabricConstraint = {
    ...defaultFabricConstraint,
    ...(constraint ?? {}),
  };
  return {
    maxSkewMs: clamp(merged.maxSkewMs, 1, 10_000),
    maxRisk: clamp(merged.maxRisk, 0, 1),
    minHeadroom: clamp(merged.minHeadroom, 0, 1),
  };
};

export const forecastSteps = (
  topology: FabricTopology,
  signals: readonly AlertSignal[],
  constraint: FabricConstraint,
): FabricPlanStep[] => {
  const sorted = [...signals].sort((left, right) => {
    const leftScore = computeSignalImpact([left]);
    const rightScore = computeSignalImpact([right]);
    return rightScore - leftScore;
  });

  const commandSequence = buildCommandSequence(topology, sorted);

  return commandSequence.map(({ commandId }, index) => ({
    stepId: `${index}-${commandId}`,
    nodeId: topology.nodes[index % Math.max(1, topology.nodes.length)]?.id ?? (`node-${index}` as any),
    action: index % 2 === 0 ? 'shift-traffic' : 'scale-up',
    rationale: `Mitigate critical signal ${index}`,
    estimatedSavings: Number((constraint.minHeadroom * 1_000).toFixed(2)),
    risk: Number((0.05 + (index % 10) * 0.007).toFixed(4)),
    tags: ['forecast', index % 2 === 0 ? 'stable' : 'aggressive'],
  }));
};

export const buildPlan = (input: FabricSimulationInput, planRunId?: string): FabricPlan => {
  const constraint = toConstraint(input.constraint);
  const steps = forecastSteps(input.topology, input.signals, constraint);
  const policyHints = input.topology.nodes.filter((node) => node.health === 'offline' || node.health === 'critical').length;
  const confidence = Number((1 - Math.min(0.95, policyHints * 0.06)).toFixed(4));
  const runId = (planRunId ?? `fabric-${input.tenantId}-${Date.now()}`) as any;

  return {
    runId,
    tenantId: input.tenantId,
    createdAt: new Date().toISOString(),
    horizonMinutes: Math.max(30, 4 * steps.length),
    constraint,
    steps,
    commandsQueued: steps.length,
    confidence,
  };
};

export const simulateReadiness = (input: FabricSimulationInput): FabricSimulationResult => {
  const topologySummary = summarizeTopology(input.topology, input.signals);
  const constraint = toConstraint(input.constraint);
  const plan = buildPlan(input, `simulate-${input.tenantId}-${Date.now()}`);

  const stress = Math.max(0.01, (topologySummary.avgSignalImpact + topologySummary.criticalNodes * 0.08) * 2);
  const riskScore = Number((stress + plan.steps.length * 0.03 + input.signals.length * 0.002).toFixed(4));
  const recommendationCount = plan.steps.filter((step) => step.risk <= constraint.maxRisk).length;

  return {
    runId: plan.runId,
    stress,
    riskScore,
    recommendationCount,
    plan,
    confidence: Math.max(0, 1 - riskScore),
  };
};

export const validatePlanByPolicy = (plan: FabricPlan, policy: FabricPolicy): FabricPolicyResult => {
  const violations = [] as Array<import('./models').FabricPolicyViolation>;

  if (!policy.allowedRoles.length) {
    violations.push({
      field: 'steps',
      reason: 'policy has no allowed node roles',
      severity: 'critical',
    });
  }

  if (plan.steps.length > policy.maxActionPerMinute) {
    violations.push({
      field: 'steps',
      reason: `steps exceed maxActionPerMinute=${policy.maxActionPerMinute}`,
      severity: 'warning',
    });
  }

  const avgRisk = plan.steps.length === 0
    ? 0
    : plan.steps.reduce((acc, step) => acc + step.risk, 0) / plan.steps.length;
  if (avgRisk > policy.allowRiskIncrease) {
    violations.push({
      field: 'steps',
      reason: `avg risk ${avgRisk.toFixed(4)} exceeds allowRiskIncrease ${policy.allowRiskIncrease}`,
      severity: 'incident',
    });
  }

  for (const step of plan.steps) {
    if (!policy.preferredActions.includes(step.action)) {
      violations.push({
        field: 'steps',
        reason: `preferred action missing for step ${step.stepId}`,
        severity: 'notice',
      });
    }
  }

  return { ok: violations.length === 0, violations };
};
