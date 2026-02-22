import { z } from 'zod';
import {
  type IncidentRecord,
  type IncidentPlan,
  type OrchestrationRun,
  recoveryEventSchema,
  incidentSchema,
  type RecoveryRoute,
} from './types';

export interface IncidentValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

const labelCheck = z.array(z.string().min(2)).max(10);

const validateRoute = (route: unknown): route is RecoveryRoute => {
  if (route === null || typeof route !== 'object') {
    return false;
  }

  const record = route as Record<string, unknown>;
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  const hasHeader = typeof record.id === 'string' && typeof record.incidentId === 'string';
  if (!hasHeader || nodes.length === 0) {
    return false;
  }

  return nodes.every((node) => {
    if (node === null || typeof node !== 'object') {
      return false;
    }
    const value = node as Record<string, unknown>;
    return typeof value.id === 'string' && Array.isArray(value.dependsOn) && typeof value.play === 'object';
  });
};

const scoreBand = (value: number): 'low' | 'medium' | 'high' => {
  if (value < 0.34) {
    return 'low';
  }
  if (value < 0.67) {
    return 'medium';
  }
  return 'high';
};

export const validateIncidentRecord = (incident: unknown): IncidentValidationResult => {
  const parsed = incidentSchema.safeParse(incident);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    };
  }

  const candidate = incident as IncidentRecord;
  const extraIssues: string[] = [];

  if (candidate.id.length === 0) {
    extraIssues.push('incident id must be non-empty');
  }

  if (!candidate.labels || candidate.labels.length === 0) {
    extraIssues.push('incident labels must contain at least one item');
  }

  const labelsOk = labelCheck.safeParse(candidate.labels);
  if (!labelsOk.success) {
    extraIssues.push(`labels invalid: ${labelsOk.error.issues.map((item) => item.message).join(';')}`);
  }

  if (!candidate.openedAt || !candidate.detectedAt) {
    extraIssues.push('timestamps required');
  }

  const level = scoreBand(candidate.signals.length > 0 ? candidate.signals.length / (candidate.signals.length + 1) : 0);
  if (candidate.labels.includes('critical') && level !== 'high') {
    extraIssues.push(`label mismatch with signal density: ${level}`);
  }

  return {
    valid: extraIssues.length === 0,
    issues: extraIssues,
  };
};

export const canApprove = (plan: IncidentPlan): boolean => {
  if (plan.approved) {
    return true;
  }

  if (plan.riskScore > 0.85) {
    return false;
  }

  if (plan.route.nodes.length < 2) {
    return false;
  }

  return true;
};

export const validateRun = (run: OrchestrationRun): IncidentValidationResult => {
  const issueList: string[] = [];
  if (run.output === undefined) {
    issueList.push('output required');
  }

  if (!run.startedAt || Number.isNaN(new Date(run.startedAt).getTime())) {
    issueList.push('invalid startedAt');
  }

  if (run.state === 'failed' && !run.finishedAt) {
    issueList.push('failed runs must include finishedAt');
  }

  return {
    valid: issueList.length === 0,
    issues: issueList,
  };
};

export const validatePlanRoute = (route: RecoveryRoute, planId?: string): IncidentValidationResult => {
  const issues: string[] = [];

  if (!validateRoute(route)) {
    issues.push('route schema invalid');
  }

  if (planId && route.id === '') {
    issues.push('route id missing');
  }

  const ids = new Set(route.nodes.map((node) => node.id));
  for (const node of route.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) {
        issues.push(`missing dependency ${String(dep)} from ${String(node.id)}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

export const validateEvent = (value: unknown): IncidentValidationResult => {
  const event = recoveryEventSchema.safeParse(value);
  if (!event.success) {
    return {
      valid: false,
      issues: event.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    };
  }

  return { valid: true, issues: [] };
};

export const summarizeValidation = (checks: readonly IncidentValidationResult[]): IncidentValidationResult => {
  const issues = checks.flatMap((check) => check.issues);
  return {
    valid: issues.length === 0,
    issues,
  };
};
