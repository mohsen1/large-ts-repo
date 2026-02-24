import { Brand, withBrand } from '@shared/core';
import { evaluateCompliance, createComplianceEnvelope } from './compliance';
import {
  ConstraintEnvelope,
  GovernanceContext,
  GovernanceEvaluation,
  GovernanceMatrix,
  GovernanceSignal,
  PolicyEnvelope,
  PolicyProfile,
  PolicyRule,
  PolicyWindow,
  createGovernanceRunId,
  SeverityBand,
} from './types';
import { evaluateConstraintEnvelope, summarizeConstraintState } from './constraints';
import { evaluatePolicyProfile, evaluatePolicyRule, findBlockingRules, rankProfiles } from './rules';
import { InMemoryGovernanceStore, type GovernanceStore } from './adapter';

export interface GovernanceEngineInput {
  readonly context: GovernanceContext;
  readonly profile: PolicyProfile;
  readonly signals: readonly GovernanceSignal[];
  readonly profileList: readonly PolicyProfile[];
  readonly windows: readonly PolicyWindow[];
  readonly rules: readonly PolicyRule[];
}

export type ReadinessSnapshot = {
  readonly tenantId: GovernanceContext['tenantId'];
  readonly readiness: number;
  readonly policyCoverage: number;
  readonly warning: string[];
};

type RankedPolicy = {
  readonly policyId: PolicyProfile['policyId'];
  readonly score: number;
};

const computeReadiness = (coverage: number, warningCount: number): number => {
  const base = Math.max(0, Math.min(100, coverage * 100));
  return Math.max(0, base - warningCount * 5);
};

export const buildConstraintEnvelope = (ctx: GovernanceContext, profile: PolicyProfile, index: number): ConstraintEnvelope => {
  return {
    id: `${ctx.tenantId}:constraint-${index}` as Brand<string, 'ConstraintEnvelopeId'>,
    tenantId: ctx.tenantId,
    title: `Constraint for ${profile.name}`,
    required: [String(profile.tenantId) as Brand<string, 'ResourceId'>],
    forbidden: [],
    rationale: `${ctx.domain} controls for ${profile.domain}`,
  };
};

export const buildEnvelope = (ctx: GovernanceContext, profiles: readonly PolicyProfile[]): PolicyEnvelope => {
  const activeProfiles = profiles.filter((profile) => profile.state === 'active');

  return {
    id: `${ctx.tenantId}:envelope` as PolicyEnvelope['id'],
    tenantId: ctx.tenantId,
    title: `Policy envelope for ${ctx.domain}`,
    policies: [...activeProfiles],
    windows: [...(ctx.state === 'active' ? [] : [])],
    rules: activeProfiles.flatMap((profile) => profile.rules),
    constraints: activeProfiles.map((profile, index) => buildConstraintEnvelope(ctx, profile, index)),
    complianceClauses: activeProfiles.map((profile, index) =>
      ({
        ...createComplianceEnvelope(ctx.tenantId),
        title: `Clause for ${profile.name} #${index}`,
        description: `${profile.name} compliance tracking`,
      }),
    ),
    createdAt: new Date().toISOString(),
  };
};

export const evaluateGovernanceMatrix = (ctx: GovernanceContext, profiles: readonly PolicyProfile[]): GovernanceMatrix => {
  const activeProfiles = profiles.filter((profile) => profile.state === 'active');
  const envelope = buildEnvelope(ctx, profiles);

  return {
    tenantId: ctx.tenantId,
    asOf: new Date().toISOString(),
    profileCount: activeProfiles.length,
    activeProfiles,
    envelopes: [envelope],
    complianceScore: activeProfiles.length === 0 ? 0 : Math.min(100, activeProfiles.length * 20),
  };
};

export const evaluateGovernance = (
  input: GovernanceEngineInput,
  store: GovernanceStore = new InMemoryGovernanceStore(),
): ReadinessSnapshot => {
  const matrix = evaluateGovernanceMatrix(input.context, input.profileList);
  void store.loadMatrix(input.context);

  const contextSignalsByMetric: Record<string, readonly number[]> = {};
  for (const signal of input.signals) {
    contextSignalsByMetric[signal.metric] = [
      ...(contextSignalsByMetric[signal.metric] ?? []),
      signal.value,
    ];
  }

  const constraintStats = summarizeConstraintState(
    matrix.envelopes.flatMap((envelope) =>
      envelope.constraints.map((constraint) => evaluateConstraintEnvelope(constraint, input.signals)),
    ),
  );

  const profileContext = {
    band: 'critical' as SeverityBand,
    activeSignals: input.signals.length,
    criticalSignals: input.signals.filter((signal) => signal.severity === 'critical').length,
    coverage: input.signals.length > 0 ? Math.min(1, input.signals.length / 10) : 0,
  };

  const rankedProfiles = rankProfiles(input.profileList, profileContext);
  const policyCoverage = rankedProfiles.length > 0 ? rankedProfiles[0]?.score ?? 0 : 0;

  const profileViolations = input.profileList.flatMap((profile) => {
    const summary = evaluatePolicyProfile(profile, profileContext);
    if (summary.passingRules === summary.totalRules) {
      return [];
    }

    return profile.rules.map((rule) => evaluatePolicyRule(rule, profileContext));
  });

  const blockingRules = findBlockingRules(profileViolations);
  const compliance = evaluateCompliance(
    input.context.tenantId,
    input.profile,
    matrix.envelopes.flatMap((envelope) => envelope.complianceClauses),
    contextSignalsByMetric,
  );

  const readiness = computeReadiness(policyCoverage, blockingRules.length + constraintStats.breached);

  const evaluation: GovernanceEvaluation = {
    tenantId: input.context.tenantId,
    runId: createGovernanceRunId(`${input.context.tenantId}:run`),
    policyCoverage,
    warningCount: blockingRules.length,
    criticalCount: constraintStats.breached,
    readinessScore: readiness,
    policySignals: profileViolations.map((entry) => ({
      ruleId: entry.rule.id,
      fired: !entry.passed,
      weight: Math.abs(entry.score),
    })),
    windowCompliance: false,
  };

  void store.saveCompliance(input.context, compliance);
  void store.saveEnvelope(input.context, matrix.envelopes[0]);

  const warnings = [
    `compliance:${complianceHealth(compliance)}`,
    `matrices:${matrix.envelopes.length}`,
    `signals:${input.signals.length}`,
    `rules:${profileViolations.length}`,
    `blocking-rules:${blockingRules.length}`,
  ];

  return {
    tenantId: input.context.tenantId,
    readiness,
    policyCoverage,
    warning: [...warnings, ...evaluation.policySignals.map((signal) => `${String(signal.ruleId)}:${signal.fired ? 'blocked' : 'ok'}`)],
  };
};

export const buildReadinessEnvelope = (ctx: GovernanceContext): PolicyEnvelope => {
  const profile: PolicyProfile = {
    policyId: withBrand(`${ctx.tenantId}-base`, 'PolicyId'),
    tenantId: ctx.tenantId,
    name: 'Base policy profile',
    domain: ctx.domain,
    state: ctx.state,
    maxConcurrent: 3,
    maxCriticality: 4,
    windowsByBand: {
      low: [],
      medium: [],
      high: [],
      critical: [],
    },
    rules: [],
  };

  return {
    id: `${ctx.tenantId}:readiness` as PolicyEnvelope['id'],
    tenantId: ctx.tenantId,
    title: 'readiness envelope',
    policies: [profile],
    windows: [],
    rules: [],
    constraints: [],
    complianceClauses: [],
    createdAt: new Date().toISOString(),
  };
};

export const topRankedPolicies = (profiles: readonly PolicyProfile[]): RankedPolicy[] => {
  return profiles
    .map((profile, index) => ({
      policyId: profile.policyId,
      score: 100 - index,
    }))
    .sort((left, right) => right.score - left.score);
};

const complianceHealth = (batch: ReturnType<typeof evaluateCompliance>): 'pass' | 'warn' | 'fail' => {
  if (batch.averageScore >= 80) {
    return 'pass';
  }
  if (batch.averageScore >= 50 && batch.failed < batch.checks.length / 2) {
    return 'warn';
  }
  return 'fail';
};
