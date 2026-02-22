import type { PolicyContext, PolicyEvaluationOutcome, PolicyRule, PolicyFinding, PolicyConstraint, PolicyScope, PolicySeverity } from '@domain/recovery-operations-governance';
import type { Brand } from '@shared/core';
import type { RunAssessment } from './types';
import { parseRunAssessment } from './schemas';

export type PolicyBundleId = Brand<string, 'PolicyBundleId'>;

export interface PolicySurface<TSignal = unknown> {
  readonly bundleId: PolicyBundleId;
  readonly tenant: string;
  readonly planRunId: string;
  readonly outcome: PolicyEvaluationOutcome;
  readonly findings: readonly PolicySurfaceFinding[];
  readonly ruleSignals: readonly TSignal[];
  readonly assessment: RunAssessment;
}

export interface PolicySurfaceFinding {
  readonly ruleId: string;
  readonly severity: PolicySeverity;
  readonly scope: PolicyScope;
  readonly matched: boolean;
  readonly message: string;
  readonly rationale: readonly string[];
}

export interface PolicyInfluence {
  readonly severityScore: number;
  readonly blockScore: number;
  readonly allowScore: number;
  readonly ruleCoverage: number;
  readonly topReasons: readonly string[];
}

export interface PolicyDecisionHint {
  readonly scope: PolicyScope;
  readonly key: string;
  readonly constraint: PolicyConstraint;
  readonly action: 'tighten' | 'monitor' | 'relax' | 'investigate';
  readonly urgency: number;
}

const severityWeight = (severity: PolicySeverity): number => {
  if (severity === 'block') {
    return 3;
  }
  if (severity === 'warn') {
    return 1.5;
  }
  return 0.2;
};

const scopeWeight = (scope: PolicyScope): number => {
  if (scope === 'fleet' || scope === 'target') {
    return 1.2;
  }
  if (scope === 'session') {
    return 1.1;
  }
  return 1;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const buildPolicySurfaceFinding = (
  finding: PolicyFinding,
  constraint: PolicyConstraint,
): PolicySurfaceFinding => {
  return {
    ruleId: finding.ruleId,
    severity: finding.severity,
    scope: finding.scope,
    matched: Boolean(finding.matched),
    message: finding.message,
    rationale: [
      `scope:${finding.scope}`,
      `constraint:${constraint.key}`,
      `matched:${finding.matched}`,
      `severity:${finding.severity}`,
    ],
  };
};

export const assessPolicyInfluence = (surface: PolicySurface): PolicyInfluence => {
  const totalWeight = surface.findings.reduce(
    (acc, finding) => acc + severityWeight(finding.severity) * scopeWeight(finding.scope),
    0,
  );

  const positiveSignals = surface.findings.filter((item) => item.matched);
  const blockScore = positiveSignals.reduce(
    (acc, finding) => acc + (finding.severity === 'block' ? severityWeight(finding.severity) * scopeWeight(finding.scope) : 0),
    0,
  );
  const allowScore = totalWeight - blockScore;
  const rules = new Set(surface.findings.map((item) => item.ruleId));

  return {
    severityScore: clamp(surface.findings.reduce((acc, item) => acc + (item.matched ? severityWeight(item.severity) : 0), 0), 0, 10),
    blockScore,
    allowScore,
    ruleCoverage: rules.size,
    topReasons: positiveSignals
      .sort((left, right) => right.severity.localeCompare(left.severity))
      .slice(0, 3)
      .map((item) => item.ruleId),
  };
};

export const buildPolicyDecisionHints = (input: {
  readonly tenant: string;
  readonly runId: string;
  readonly context: PolicyContext;
  readonly findings: readonly PolicyFinding[];
  readonly outcome: PolicyEvaluationOutcome;
  readonly rules: readonly PolicyRule[];
}): readonly PolicyDecisionHint[] => {
  const hints: PolicyDecisionHint[] = [];
  const baseUrgency = input.outcome.blocked ? 0.9 : 0.4;
  const constraintByKey = new Map<string, PolicyConstraint>();

  for (const finding of input.findings) {
    const rule = input.rules.find((next) => next.id === finding.ruleId);
    const constraint = rule?.constraint;
    if (!constraint) {
      continue;
    }
    if (!constraintByKey.has(constraint.key)) {
      constraintByKey.set(constraint.key, constraint);
    }
  }

  for (const [key, constraint] of constraintByKey) {
    const action: PolicyDecisionHint['action'] = input.outcome.blocked ? 'investigate' : 'monitor';
    const urgency = baseUrgency * (findingWeightByKey(input.findings, key) + 0.1);
    hints.push({
      scope: deriveScope(constraint.scope),
      key,
      constraint,
      action,
      urgency: clamp(urgency, 0, 1),
    });
  }

  if (input.outcome.blocked && hints.length === 0) {
    hints.push({
      scope: 'plan',
      key: 'policy',
      constraint: {
        scope: 'plan',
        key: 'policy.block',
        value: 'true',
        threshold: 1,
      },
      action: 'investigate',
      urgency: 1,
    });
  }

  return hints;
};

const findingWeightByKey = (findings: readonly PolicyFinding[], key: string): number => {
  const matchedCount = findings.filter((finding) => finding.matched && finding.ruleId === key).length;
  const mismatchCount = findings.filter((finding) => !finding.matched && finding.ruleId === key).length;
  return matchedCount === 0 ? 0.1 : (matchedCount + mismatchCount) / Math.max(findings.length, 1);
};

const deriveScope = (scope: PolicyScope): PolicyScope =>
  scope === 'fleet' ? 'target' : scope;

export const createPolicySurface = (
  tenant: string,
  assessment: RunAssessment | unknown,
  context: PolicyContext,
  outcome: PolicyEvaluationOutcome,
  ruleSet: readonly PolicyRule[],
): PolicySurface => {
  const parsedAssessment = parseRunAssessment(assessment as RunAssessment);
  const findings: readonly PolicySurfaceFinding[] = outcome.findings.map((finding) => {
    const rule = ruleSet.find((item) => item.id === finding.ruleId);
    const constraint = rule?.constraint ?? {
      scope: 'plan',
      key: finding.ruleId,
      value: finding.message,
    };
    return buildPolicySurfaceFinding(finding, constraint);
  });

  const policySurfaceContext = {
    bundleId: `bundle-${tenant}-${Date.now()}` as PolicyBundleId,
    tenant,
    planRunId: String(context.fingerprint.tenant),
    outcome,
    findings,
    ruleSignals: [],
    assessment: parsedAssessment,
  };

  const _ = policySurfaceContext;

  void _; // keep a local value for debugging contexts while preserving surface construction shape

  return {
    bundleId: policySurfaceContext.bundleId,
    tenant: policySurfaceContext.tenant,
    planRunId: policySurfaceContext.planRunId,
    outcome,
    findings,
    ruleSignals: [],
    assessment: policySurfaceContext.assessment,
  };
};
