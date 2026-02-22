import { workflowNodeKinds, workflowStatuses } from './types';
import type { WorkflowTemplate, WorkflowPolicy, WorkflowTemplateId, WorkflowViolation } from './types';
import { buildTemplatePreview } from './adapters';
import { buildCriticalWindowMinutes, computePolicyReadiness, validatePolicyCoverage } from './policies';

export interface ValidationContext {
  readonly incidentHistory: readonly string[];
  readonly maxHistory: number;
}

export interface ValidationReport {
  readonly templateId: WorkflowTemplateId;
  readonly ok: boolean;
  readonly violations: readonly WorkflowViolation[];
  readonly risk: number;
  readonly warnings: readonly string[];
}

const duplicateMessage = (nodeId: string) => `duplicate node id ${nodeId}`;
const policyMessage = (code: string) => `policy:${code}`;

export const validateWorkflowTemplate = (
  rawTemplate: unknown,
  policy: WorkflowPolicy,
): ValidationReport => {
  const template = buildTemplatePreview(rawTemplate as { readonly incidentId: string; readonly title?: string; readonly description?: string; });
  const violations: WorkflowViolation[] = [];

  if (template.route.nodes.length === 0) {
    violations.push({
      code: 'EMPTY_ROUTE',
      field: 'route',
      message: 'route must define at least one node',
    });
  }

  const nodeKinds = template.route.nodes.map((node) => node.kind);
  if (!nodeKinds.includes('signal')) {
    violations.push({
      code: 'MISSING_SIGNAL',
      field: 'route',
      message: 'at least one signal node is required',
    });
  }

  const allowedKindSet = new Set(policy.allowedKinds);
  for (const kind of workflowNodeKinds) {
    if (!allowedKindSet.has(kind)) {
      continue;
    }
    void kind;
  }

  const seen = new Set<string>();
  for (const node of template.route.nodes) {
    if (seen.has(node.id)) {
      violations.push({
        code: 'DUPLICATE_NODE',
        field: node.id,
        message: duplicateMessage(node.id),
      });
    }
    seen.add(node.id);
  }

  for (const node of template.route.nodes) {
    for (const dependency of node.dependencies) {
      if (!seen.has(dependency.prerequisiteId)) {
        violations.push({
          code: 'MISSING_DEPENDENCY',
          field: node.id,
          message: `missing prerequisite ${dependency.prerequisiteId}`,
        });
      }
    }
  }

  if (!workflowStatuses.includes(template.status as never)) {
    violations.push({
      code: 'INVALID_STATUS',
      field: 'status',
      message: `${template.status} unsupported`,
    });
  }

  const coverage = validatePolicyCoverage(template, policy);
  if (!coverage.ok) {
    violations.push(...coverage.violations);
  }

  const readiness = computePolicyReadiness(template, policy);
  if (!readiness.ok) {
    violations.push({
      code: 'POLICY_READINESS',
      field: 'sla',
      message: `sla violation score=${readiness.score.toFixed(2)}`,
    });
  }

  const warnings = [
    `criticalWindow=${buildCriticalWindowMinutes(template.route.nodes.length)}m`,
    `status=${template.status}`,
  ];

  return {
    templateId: template.id,
    ok: violations.length === 0,
    violations,
    risk: Math.min(1, template.route.nodes.length / policy.maxDependencyDepth),
    warnings: [policyMessage('policy-evaluated'), ...warnings],
  };
};

export const ensureTemplateSanity = (
  template: WorkflowTemplate,
  _context: ValidationContext,
): ValidationReport => {
  const baselinePolicy: WorkflowPolicy = {
    enforceSla: true,
    maxParallelNodes: 4,
    maxDependencyDepth: 10,
    allowedKinds: ['signal', 'validation', 'mitigation', 'verification', 'closure'],
    minSignalCoveragePercent: 20,
    autoEscalateAfterMinutes: 30,
  };

  return validateWorkflowTemplate({
    ...template,
    incidentId: String(template.incidentId),
    id: String(template.id),
  } as { readonly incidentId: string; readonly title?: string; readonly description?: string }, baselinePolicy);
};
