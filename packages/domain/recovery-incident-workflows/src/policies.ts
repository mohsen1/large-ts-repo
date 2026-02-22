import type { IncidentPriorityVector, IncidentRecord } from '@domain/recovery-incident-orchestration';
import type { WorkflowPolicy, WorkflowTemplate, WorkflowViolation } from './types';
import { normalizeNodeId } from './types';

export interface PolicyReadiness {
  readonly ok: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface PolicyCoverage {
  readonly ok: boolean;
  readonly ratio: number;
  readonly violations: readonly WorkflowViolation[];
}

export const buildCriticalWindowMinutes = (nodeCount: number): number => nodeCount * 5;

export const classifyPriority = (
  vector: IncidentPriorityVector,
): 'low' | 'medium' | 'high' => {
  if (vector.compositeScore >= 80) {
    return 'high';
  }
  if (vector.compositeScore >= 45) {
    return 'medium';
  }
  return 'low';
}

export const estimateWindowHealth = (template: WorkflowTemplate, policy: WorkflowPolicy): number => {
  const total = template.route.nodes.reduce((acc, node) => acc + node.expectedDurationMinutes, 0);
  if (total === 0) {
    return 1;
  }
  return policy.enforceSla
    ? Math.max(0, 1 - total / Math.max(1, template.route.slaWindowMinutes))
    : 1;
};

export const computePolicyReadiness = (template: WorkflowTemplate, policy: WorkflowPolicy): PolicyReadiness => {
  const reasons: string[] = [];
  const parallelOk = template.route.nodes.length <= policy.maxParallelNodes * policy.maxDependencyDepth;
  const riskOk = template.route.riskWeight <= 1;
  const windowHealth = estimateWindowHealth(template, policy);
  const readiness = Number((parallelOk ? 0.4 : 0) + (riskOk ? 0.3 : 0) + (windowHealth * 0.3));
  if (!parallelOk) {
    reasons.push('max parallel-depth exceeded');
  }
  if (!riskOk) {
    reasons.push('risk-weight overflow');
  }
  if (windowHealth <= 0) {
    reasons.push('sla window exceeded');
  }
  return {
    ok: reasons.length === 0 && readiness >= 0.5,
    score: readiness,
    reasons,
  };
};

export const validatePolicyCoverage = (template: WorkflowTemplate, policy: WorkflowPolicy): PolicyCoverage => {
  const allowed = new Set(policy.allowedKinds);
  const covered = template.route.nodes.filter((node) => allowed.has(node.kind));
  const ratio = template.route.nodes.length === 0
    ? 0
    : covered.length / template.route.nodes.length;
  const violations: WorkflowViolation[] = [];
  if (ratio < policy.minSignalCoveragePercent / 100) {
    violations.push({
      code: 'COVERAGE',
      field: 'nodes',
      message: `covered=${ratio.toFixed(2)} threshold=${policy.minSignalCoveragePercent}`,
    });
  }
  return {
    ok: violations.length === 0,
    ratio,
    violations,
  };
};

export const buildExecutionBudget = (template: WorkflowTemplate, policy: WorkflowPolicy): {
  readonly maxWindowMinutes: number;
  readonly maxRetries: number;
  readonly allowedKinds: readonly string[];
} => ({
  maxWindowMinutes: Math.max(
    1,
    template.route.nodes.length * Math.min(1, template.route.riskWeight) * policy.autoEscalateAfterMinutes,
  ),
  maxRetries: Math.max(1, Math.floor(policy.maxParallelNodes * policy.maxDependencyDepth / 2)),
  allowedKinds: policy.allowedKinds.slice(),
});

export const mapPrioritySignals = (incident: IncidentRecord): readonly string[] =>
  Object.entries(incident.scope)
    .map(([key, value]) => `${key}:${value}`)
    .concat(incident.labels.map((label) => `label:${label}`));

export const buildPriorityScoreByIncident = (incident: IncidentRecord): IncidentPriorityVector['compositeScore'] =>
  incident.severity === 'extreme'
    ? 100
    : incident.severity === 'critical'
      ? 85
      : incident.severity === 'high'
        ? 70
        : incident.severity === 'medium'
          ? 50
          : 20;

export const buildRouteReadinessMap = (
  template: WorkflowTemplate,
): ReadonlyMap<string, string> => {
  const map = new Map<string, string>();
  for (const node of template.route.nodes) {
    const key = normalizeNodeId(node);
    map.set(key, `${template.id}:${node.id}`);
  }
  return map;
};
