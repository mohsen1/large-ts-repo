import {
  type RecoveryAtlasDecisionContext,
  type RecoveryAtlasSnapshot,
  type RecoveryAtlasPlan,
  type RecoveryAtlasRunId,
  type RecoveryAtlasRunReport,
  type RecoveryAtlasNode,
  type RecoveryAtlasPlanId,
  type PlanEnvelope,
} from './types';
import { calculateNodeRisk, createPlanId, normalizeScore } from './utils';
import { pathsForWindow } from './graph';

export interface CandidatePlanFactoryInput {
  readonly snapshot: RecoveryAtlasSnapshot;
  readonly context: RecoveryAtlasDecisionContext;
  readonly seed: number;
}

export interface CandidatePlanResult {
  readonly plans: readonly RecoveryAtlasPlan[];
  readonly telemetry: readonly RecoveryAtlasTelemetryEvent[];
  readonly bestPlanId?: RecoveryAtlasPlanId;
}

import type { RecoveryAtlasTelemetryEvent, RecoveryAtlasRunStep } from './types';

const scorePlan = (plan: RecoveryAtlasPlan): number => {
  const riskPenalty = plan.steps.reduce((acc, step) => acc + Math.min(step.expectedDurationMinutes, 30), 0);
  const approvalPenalty = plan.steps.reduce((acc, step) => acc + step.requiredApprovals.length * 4, 0);
  return normalizeScore(100 - (riskPenalty + approvalPenalty + plan.priority));
};

const derivePlanFromPath = (
  snapshot: RecoveryAtlasSnapshot,
  pathNodeIds: readonly RecoveryAtlasSnapshot['graph']['nodes'][number]['id'][],
  context: PlanEnvelope,
  seed: number,
): RecoveryAtlasPlan => {
  const nodes = pathNodeIds
    .map((nodeId) => snapshot.graph.nodes.find((node) => node.id === nodeId))
    .filter(Boolean) as readonly RecoveryAtlasNode[];

  const steps: RecoveryAtlasRunStep[] = nodes.flatMap((node) => {
    const riskScore = calculateNodeRisk(node);
    const duration = Math.max(6, Math.round((riskScore / 10) + 3));

    return [
      {
        id: `${node.id}:assess` as RecoveryAtlasRunStep['id'],
        label: `Assess ${node.component}`,
        owner: node.ownerTeam,
        expectedDurationMinutes: duration,
        requiredApprovals: riskScore > 80 ? ['platform-lead'] : [],
        dependsOn: [],
      },
      {
        id: `${node.id}:stabilize` as RecoveryAtlasRunStep['id'],
        label: `Stabilize ${node.component}`,
        owner: node.ownerTeam,
        expectedDurationMinutes: Math.max(7, duration + 2),
        requiredApprovals: node.ownerTeam === 'platform' ? ['security'] : [],
        dependsOn: [`${node.id}:assess`],
      },
    ];
  });

  const notes = context.reasoning.join(' | ') + ` seed=${seed}`;

  return {
    id: context.planId,
    nodeIds: nodes.map((node) => node.id),
    title: `Atlas plan for ${snapshot.id}`,
    notes,
    priority: Math.round((1 - context.confidence) * 100),
    estimatedMinutes: steps.reduce((acc, step) => acc + step.expectedDurationMinutes, 0),
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const evaluateRunReport = (
  runId: RecoveryAtlasRunId,
  planId: RecoveryAtlasPlan['id'],
  plan: RecoveryAtlasPlan,
): RecoveryAtlasRunReport => {
  const diagnostics: RecoveryAtlasTelemetryEvent[] = plan.steps.map((step) => ({
    source: 'recovery-operations-atlas',
    type: 'run_completed',
    at: new Date().toISOString(),
    runId,
    planId,
    message: `executed ${step.label}`,
    severity: 'low',
    metadata: {
      stepId: step.id,
      duration: step.expectedDurationMinutes,
      owner: step.owner,
    },
  }));

  return {
    runId,
    planId,
    tenantId: 'atlas-tenant',
    startedAt: new Date(Date.now() - 300_000).toISOString(),
    endedAt: new Date().toISOString(),
    passed: true,
    completedSteps: plan.steps.length,
    failedSteps: 0,
    warnings: diagnostics.filter((diagnostic) => diagnostic.message.includes('warn')).map((diagnostic) => diagnostic.message),
    diagnostics,
  };
};

export const buildCandidatePlans = (input: CandidatePlanFactoryInput): CandidatePlanResult => {
  const { snapshot, context, seed } = input;
  const paths = pathsForWindow(snapshot);

  const envelopes: PlanEnvelope[] = paths
    .slice(0, 3)
    .map((path, index) => ({
      planId: createPlanId(`plan-${snapshot.id}-${index}`),
      windowIds: [snapshot.id],
      confidence: 0.5 + index * 0.1,
      reasoning: [`path length=${path.nodeIds.length}`, `constrained=${path.constrained}`, `steps=${path.stepCount}`],
    }));

  const plans = envelopes.map((envelope, index) => {
    const selectedPath = paths[index] ?? paths[0];
    const pathNodes = selectedPath ? selectedPath.nodeIds : snapshot.graph.nodes.map((node) => node.id);
    return derivePlanFromPath(snapshot, pathNodes, envelope, seed + index);
  });

  const rankedPlans = [...plans].sort((left, right) => scorePlan(right) - scorePlan(left));

  const bestPlan = rankedPlans[0];

  const telemetry: RecoveryAtlasTelemetryEvent[] = rankedPlans.flatMap((plan) => [
    {
      source: 'recovery-operations-atlas',
      type: 'plan_generated',
      at: new Date().toISOString(),
      planId: plan.id,
      incidentId: snapshot.incidentId,
      message: `generated plan ${plan.title}`,
      severity: 'medium',
      metadata: {
        planId: plan.id,
        stepCount: plan.steps.length,
      },
    },
  ]);

  return {
    plans: rankedPlans,
    telemetry,
    bestPlanId: bestPlan?.id,
  };
};

export const simulatePlanExecution = (plan: RecoveryAtlasPlan): RecoveryAtlasRunReport => {
  const runId = `${plan.id}:run` as RecoveryAtlasRunId;
  return evaluateRunReport(runId, plan.id, plan);
};

export const bestPlanOrFallback = (plans: readonly RecoveryAtlasPlan[]): RecoveryAtlasPlan | undefined => {
  if (plans.length === 0) return undefined;
  return plans.reduce((acc, plan) => (scorePlan(plan) > scorePlan(acc) ? plan : acc));
};
