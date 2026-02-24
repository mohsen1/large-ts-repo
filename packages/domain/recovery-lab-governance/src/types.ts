import { Brand, normalizeLimit, withBrand } from '@shared/core';

export type GovernanceTenantId = Brand<string, 'GovernanceTenantId'>;
export type GovernanceRunId = Brand<string, 'GovernanceRunId'>;
export type PolicyId = Brand<string, 'PolicyId'>;
export type RuleId = Brand<string, 'RuleId'>;
export type ComplianceId = Brand<string, 'ComplianceId'>;

export const severityBands = ['low', 'medium', 'high', 'critical'] as const;
export type SeverityBand = (typeof severityBands)[number];

export const domainStates = ['inactive', 'draft', 'active', 'paused', 'retired'] as const;
export type GovernanceDomainState = (typeof domainStates)[number];

export interface GovernanceContext {
  readonly tenantId: GovernanceTenantId;
  readonly timestamp: string;
  readonly domain: string;
  readonly region: string;
  readonly state: GovernanceDomainState;
}

export interface GovernanceSignal {
  readonly id: Brand<string, 'GovernanceSignalId'>;
  readonly metric: string;
  readonly severity: SeverityBand;
  readonly value: number;
  readonly tags: readonly string[];
  readonly observedAt: string;
}

export interface PolicyWindow {
  readonly id: Brand<string, 'PolicyWindowId'>;
  readonly tenantId: GovernanceTenantId;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly openForAllBands: boolean;
  readonly allowedBands: readonly SeverityBand[];
}

export interface PolicyRule<TScope extends string = 'global'> {
  readonly id: RuleId;
  readonly tenantId: GovernanceTenantId;
  readonly policyId: PolicyId;
  readonly scope: TScope;
  readonly code: string;
  readonly condition: string;
  readonly penaltyPoints: number;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface ComplianceClause {
  readonly id: ComplianceId;
  readonly tenantId: GovernanceTenantId;
  readonly region: string;
  readonly title: string;
  readonly description: string;
  readonly requiresEncryption: boolean;
  readonly maxRtoMinutes: number;
  readonly maxRpoMinutes: number;
  readonly lastAuditAt: string;
}

export interface ConstraintEnvelope {
  readonly id: Brand<string, 'ConstraintEnvelopeId'>;
  readonly tenantId: GovernanceTenantId;
  readonly title: string;
  readonly required: readonly Brand<string, 'ResourceId'>[];
  readonly forbidden: readonly Brand<string, 'ResourceId'>[];
  readonly rationale: string;
}

export interface GovernanceEvaluation {
  readonly tenantId: GovernanceTenantId;
  readonly runId: GovernanceRunId;
  readonly policyCoverage: number;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly readinessScore: number;
  readonly policySignals: readonly { readonly ruleId: RuleId; readonly fired: boolean; readonly weight: number }[];
  readonly windowCompliance: boolean;
}

export interface PolicyEnvelope {
  readonly id: Brand<string, 'PolicyEnvelopeId'>;
  readonly tenantId: GovernanceTenantId;
  readonly title: string;
  readonly policies: readonly PolicyProfile[];
  readonly windows: readonly PolicyWindow[];
  readonly rules: readonly PolicyRule[];
  readonly constraints: readonly ConstraintEnvelope[];
  readonly complianceClauses: readonly ComplianceClause[];
  readonly createdAt: string;
}

export interface PolicyProfile {
  readonly policyId: PolicyId;
  readonly tenantId: GovernanceTenantId;
  readonly name: string;
  readonly domain: string;
  readonly state: GovernanceDomainState;
  readonly maxConcurrent: number;
  readonly maxCriticality: number;
  readonly windowsByBand: Record<SeverityBand, readonly PolicyWindow['id'][]>;
  readonly rules: readonly PolicyRule[];
}

export interface RankedPolicy {
  readonly policyId: PolicyId;
  readonly score: number;
  readonly band: SeverityBand;
}

export interface GovernanceMatrix {
  readonly tenantId: GovernanceTenantId;
  readonly asOf: string;
  readonly profileCount: number;
  readonly activeProfiles: readonly PolicyProfile[];
  readonly envelopes: readonly PolicyEnvelope[];
  readonly complianceScore: number;
}

export const createGovernanceTenantId = (value: string): GovernanceTenantId => withBrand(String(value).trim(), 'GovernanceTenantId');
export const createPolicyId = (value: string): PolicyId => withBrand(String(value).trim(), 'PolicyId');
export const createRuleId = (value: string): RuleId => withBrand(String(value).trim(), 'RuleId');
export const createGovernanceRunId = (value: string): GovernanceRunId => withBrand(String(value).trim(), 'GovernanceRunId');
export const clampPolicyRatio = (value: number): number => normalizeLimit(value);
export const buildPolicyMap = <T extends { readonly id: string }>(values: readonly T[]): Record<string, T> => {
  const map: Record<string, T> = {};
  for (const value of values) {
    map[value.id] = value;
  }
  return map;
};

export type OptionalBandRecord<T> = Partial<Record<SeverityBand, T>>;
export type BandBuckets<T> = {
  readonly low: readonly T[];
  readonly medium: readonly T[];
  readonly high: readonly T[];
  readonly critical: readonly T[];
};

export const normalizeSeverityBands = (bands: readonly SeverityBand[]): readonly SeverityBand[] => {
  const normalized = new Set<SeverityBand>();
  for (const band of bands) {
    normalized.add(band);
  }
  return Array.from(normalized);
};

export const pickTopSignals = (signals: readonly GovernanceSignal[], limit: number): readonly GovernanceSignal[] => {
  const target = normalizeLimit(limit);
  return [...signals]
    .sort((left, right) => right.value - left.value)
    .slice(0, target);
};
