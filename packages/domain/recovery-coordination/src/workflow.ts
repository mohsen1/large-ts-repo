import { withBrand } from '@shared/core';
import { summarizeTopology, topologicalOrder } from './topology';
import { criticalConstraints, constraintSummary as constraintsSummary } from './constraints';
import { resolveConstraintWindow } from './constraints';
import { defaultWindowPolicy } from './policy';
import { summarizeQuality, createQualityGate } from './quality';
import type {
  CoordinationPolicyDecision,
  CoordinationWindow,
  CoordinationConstraint,
  CoordinationProgram,
  CoordinationPlanCandidate,
  CoordinationSelectionResult,
  CoordinationStep,
  CoordinationTenant,
  CoordinationRunId,
} from './types';

export interface WorkflowEnvelope {
  readonly tenant: CoordinationTenant;
  readonly runId: CoordinationRunId;
  readonly programId: CoordinationProgram['id'];
  readonly phase: 'discover' | 'plan' | 'select' | 'execute' | 'observe' | 'complete';
  readonly emittedAt: string;
}

export interface WorkflowNode {
  readonly step: CoordinationStep;
  readonly position: number;
  readonly layer: number;
  readonly predecessors: readonly string[];
}

export interface WorkflowGraph {
  readonly programId: CoordinationProgram['id'];
  readonly nodes: readonly WorkflowNode[];
  readonly timelineMinutes: number;
  readonly riskIndex: number;
  readonly qualityScore: number;
}

export interface WorkflowSignal {
  readonly code: string;
  readonly level: 'info' | 'warning' | 'critical';
  readonly message: string;
  readonly at: string;
}

export interface WorkflowReport {
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly graph: WorkflowGraph;
  readonly constraints: CoordinationWindow;
  readonly signalCount: number;
  readonly isBlocked: boolean;
  readonly candidateCount: number;
}

export interface WorkflowPolicyDecisionContext {
  readonly policy: CoordinationPolicyDecision;
  readonly candidate: CoordinationPlanCandidate;
  readonly signals: readonly WorkflowSignal[];
  readonly selection: CoordinationSelectionResult;
}

export const buildWorkflowGraph = (program: CoordinationProgram): WorkflowGraph => {
  const nodes = buildNodes(program);
  const layerMap = nodes.reduce<Record<number, number>>((acc, node) => {
    acc[node.layer] = (acc[node.layer] ?? 0) + 1;
    return acc;
  }, {});
  const timelineMinutes = Object.entries(layerMap).reduce((sum, [layer, count]) =>
    sum + Number(count) * Math.max(1, Number(layer) + 1) * 3,
  0);

  return {
    programId: program.id,
    nodes,
    timelineMinutes,
    riskIndex: computeRiskIndex(program.constraints),
    qualityScore: summarizeQuality(program.constraints, program.steps),
  };
};

export const validateWorkflowPolicy = (candidate: CoordinationPlanCandidate, constraints: readonly CoordinationConstraint[]) => {
  const criticalIds = criticalConstraints(constraints);
  const blocked = criticalIds.some((id: string) => candidate.steps.some((step) => step.id === id));
  const order = topologicalOrder(candidate.steps);
  const validTopology = order.length === candidate.steps.length;
  const gate = createQualityGate(candidate, constraints);

  const signals: CoordinationPolicyDecision[] = [];
  if (!validTopology) {
    signals.push({
      policyId: withBrand('topology', 'RecoveryPolicyId'),
      result: 'blocked',
      confidence: 0,
      reasons: ['candidate-topology-disconnected'],
      evaluatedAt: new Date().toISOString(),
    });
  }
  if (blocked) {
    signals.push({
      policyId: withBrand('constraint', 'RecoveryPolicyId'),
      result: 'blocked',
      confidence: 0.98,
      reasons: ['critical-constraint-blocked'],
      evaluatedAt: new Date().toISOString(),
    });
  }
  if (!gate) {
    signals.push({
      policyId: withBrand('resilience', 'RecoveryPolicyId'),
      result: 'deferred',
      confidence: 0.52,
      reasons: ['quality-gate-deferred'],
      evaluatedAt: new Date().toISOString(),
    });
  }

  if (!signals.length) {
    signals.push({
      policyId: withBrand('coordination', 'RecoveryPolicyId'),
      result: 'approved',
      confidence: 1,
      reasons: ['policy-clean'],
      evaluatedAt: new Date().toISOString(),
    });
  }

  const active = signals.at(-1) ?? signals[0];
  return {
    candidate,
    policy: active,
    blocked,
    validTopology,
  };
};

export const summarizeWorkflow = (program: CoordinationProgram, constraints: readonly CoordinationConstraint[]): WorkflowReport => {
  const graph = buildWorkflowGraph(program);
  const policyWindow = resolveConstraintWindow(constraints, defaultWindowPolicy(program.runWindow));
  const policySignals = buildSignals(program);
  const isBlocked = graph.nodes.length > 0 && graph.timelineMinutes > program.steps.length * 45;

  return {
    runId: asCoordinationRunId(program.id),
    tenant: program.tenant,
    graph,
    constraints: program.runWindow,
    signalCount: policySignals.length,
    isBlocked,
    candidateCount: policyWindow.length,
  };
};

export const applyPolicyEnvelope = (context: WorkflowPolicyDecisionContext): WorkflowEnvelope => {
  const phase = context.selection.decision === 'approved'
    ? 'complete'
    : context.selection.decision === 'deferred'
      ? 'observe'
      : 'select';

  return {
    tenant: context.candidate.tenant,
    runId: context.candidate.runId,
    programId: context.candidate.programId,
    phase,
    emittedAt: new Date().toISOString(),
  };
};

export const renderSignalFeed = (signals: readonly WorkflowSignal[]) =>
  signals.map((signal) => `${signal.code}:${signal.level}:${signal.message}`).join('\n');

export const buildSignals = (program: CoordinationProgram): readonly WorkflowSignal[] => program.constraints.map((constraint, index) => ({
  code: `constraint-${constraint.id}`,
  level: constraint.weight >= 0.8 ? 'critical' : constraint.weight >= 0.4 ? 'warning' : 'info',
  message: `${constraint.kind}:${constraint.scope}:${constraint.affectedStepIds.length}:${index}`,
  at: new Date().toISOString(),
}));

const buildNodes = (program: CoordinationProgram): readonly WorkflowNode[] => {
  const summary = summarizeTopology(program.steps);
  const layerRank = new Map<string, number>();
  summary.layers.forEach((layer, level) => {
    for (const stepId of layer) {
      layerRank.set(stepId, level);
    }
  });

  return program.steps.map((step, index) => ({
    step,
    position: index + 1,
    layer: layerRank.get(step.id) ?? 0,
    predecessors: [...step.requires],
  }));
};

export const estimateExecution = (program: CoordinationProgram): number => {
  const graph = buildWorkflowGraph(program);
  const constraint = constraintsSummary(program.constraints);
  const normalizedRisk = graph.riskIndex / Math.max(1, constraint.criticalCount + 1);
  return Math.round(graph.timelineMinutes * (1 + normalizedRisk));
};

const computeRiskIndex = (constraints: readonly CoordinationConstraint[]): number => {
  if (!constraints.length) {
    return 0;
  }
  return (
    constraints.reduce((sum, constraint) => sum + constraint.weight, 0)
    / constraints.length
  );
};

const asCoordinationRunId = (value: string): CoordinationRunId => withBrand(value, 'RecoveryRunId');
