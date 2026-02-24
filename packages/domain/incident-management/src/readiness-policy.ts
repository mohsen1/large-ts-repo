import type { IncidentRecord, IncidentId, IncidentSeverity, TriageContext, IncidentState, IncidentSource, IncidentLabel } from './types';
import type { IncidentRecord as IncidentRecordAlias } from './types';
import { withBrand } from '@shared/core';
import type { Merge } from '@shared/type-level';

export type ReadinessPolicyId = ReturnType<typeof withBrand>;

export interface ReadinessPolicy {
  readonly id: ReadinessPolicyId;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly severityCutoff: IncidentSeverity;
  readonly sourceAllowlist: readonly IncidentSource[];
  readonly maxOpenForService: number;
  readonly requireConfidenceAbove: number;
  readonly autoEscalateAfterMinutes: number;
}

export interface ReadinessPolicySnapshot {
  readonly policyId: ReadinessPolicyId;
  readonly tenantId: string;
  readonly tenantReady: boolean;
  readonly summary: string;
  readonly matchedIncidentCount: number;
  readonly blockedCount: number;
}

export interface PolicyEvaluationContext {
  readonly incident: IncidentRecordAlias;
  readonly openForService: number;
  readonly hasRecentIncident: boolean;
  readonly now: Date;
}

export interface PolicyEvaluation {
  readonly policyId: ReadinessPolicyId;
  readonly incidentId: IncidentId;
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly urgencyScore: number;
}

export interface PolicyMatrix {
  readonly policyId: ReadinessPolicyId;
  readonly rules: readonly {
    readonly source: IncidentSource;
    readonly severities: readonly IncidentSeverity[];
    readonly minConfidence: number;
    readonly autoEscalate: boolean;
  }[];
}

const policyId = (value: string): ReadinessPolicyId => withBrand(value, 'ReadinessPolicyId');

export const defaultReadinessPolicy = (tenantId: string): ReadinessPolicy => ({
  id: policyId(`${tenantId}:default`),
  tenantId,
  name: 'default-readiness-policy',
  description: 'Balanced readiness and escalation defaults for routine operations',
  severityCutoff: 'sev2',
  sourceAllowlist: ['alert', 'slo', 'customer', 'ops-auto', 'security-posture'],
  maxOpenForService: 6,
  requireConfidenceAbove: 0.82,
  autoEscalateAfterMinutes: 30,
});

export const toLabelKey = (labels: readonly IncidentLabel[]): string => {
  return labels
    .map((label) => `${label.key}:${label.value}`)
    .sort()
    .join('|');
};

const meetsSeverity = (policy: ReadinessPolicy, severity: IncidentSeverity): boolean =>
  severity === policy.severityCutoff || severity === 'sev1' || policy.severityCutoff === 'sev4' || (severity === 'sev3' && policy.severityCutoff === 'sev2');

const incidentAgeMinutes = (incident: Pick<IncidentRecord, 'createdAt' | 'updatedAt'>, now: Date): number => {
  const updated = Date.parse(incident.updatedAt);
  if (Number.isNaN(updated)) return 0;
  return Math.max(0, Math.floor((now.getTime() - updated) / 60000));
};

export const evaluatePolicy = (policy: ReadinessPolicy, context: PolicyEvaluationContext): PolicyEvaluation => {
  const reasons: string[] = [];
  const triage = context.incident.triage;
  const ageMinutes = incidentAgeMinutes(context.incident, context.now);

  if (!policy.sourceAllowlist.includes(triage.source)) {
    reasons.push('source-denied');
  }

  if (!meetsSeverity(policy, triage.severity)) {
    reasons.push('severity-exempt');
  }

  if (triage.confidence < policy.requireConfidenceAbove) {
    reasons.push('confidence-below-threshold');
  }

  if (context.openForService > policy.maxOpenForService) {
    reasons.push('service-capacity-exceeded');
  }

  if (!context.hasRecentIncident && ageMinutes > policy.autoEscalateAfterMinutes && triage.severity === 'sev1') {
    reasons.push('stale-critical-no-recent');
  }

  const urgencyScore = Math.min(100, triage.confidence * 100 + severityToWeight(triage.severity) * 15 + Math.min(40, ageMinutes / 2));
  const allowed = reasons.length === 0 || context.incident.state === 'false-positive';
  return {
    policyId: policy.id,
    incidentId: context.incident.id,
    allowed,
    reasons,
    urgencyScore,
  };
};

const severityToWeight = (severity: IncidentSeverity): number => {
  if (severity === 'sev1') return 5;
  if (severity === 'sev2') return 4;
  if (severity === 'sev3') return 2;
  return 1;
};

export const toPolicySnapshot = (
  policy: ReadinessPolicy,
  evaluations: readonly PolicyEvaluation[],
): Readonly<ReadinessPolicySnapshot> => {
  const blocked = evaluations.filter((item) => !item.allowed).length;
  const summary = blocked === 0 ? 'policy-green' : 'policy-yellow';
  const tenantReady = blocked === 0 && evaluations.length < policy.maxOpenForService;

  return {
    policyId: policy.id,
    tenantId: policy.tenantId,
    tenantReady,
    summary,
    matchedIncidentCount: evaluations.length,
    blockedCount: blocked,
  };
};

export const toSeverityWeight = (state: IncidentState): number => (state === 'resolved' || state === 'false-positive' ? 1 : 7);

export const choosePolicy = (
  policy: ReadinessPolicy,
  incidents: readonly IncidentRecord[],
): ReadinessPolicySnapshot => {
  const evaluations = incidents.map((incident) =>
    evaluatePolicy(policy, {
      incident,
      openForService: incidents.filter((item) => item.serviceId === incident.serviceId).length,
      hasRecentIncident: incidentAgeMinutes(incident, new Date()) < 90,
      now: new Date(),
    }),
  );
  return toPolicySnapshot(policy, evaluations);
};

export const mergePolicyMatrix = <L extends PolicyMatrix, R extends PolicyMatrix>(
  left: L,
  right: R,
): Merge<L, R> => {
  return {
    ...left,
    ...right,
    rules: [...left.rules, ...right.rules],
  } as Merge<L, R>;
};

export const makeTriageContext = (base: TriageContext): TriageContext => ({ ...base, observedAt: base.observedAt });
