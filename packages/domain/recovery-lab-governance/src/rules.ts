import { clampPolicyRatio, PolicyRule, PolicyProfile, SeverityBand } from './types';

export type PolicyScope = PolicyRule['scope'];

export interface RuleContext {
  readonly band: SeverityBand;
  readonly activeSignals: number;
  readonly criticalSignals: number;
  readonly coverage: number;
}

export interface RuleEvaluation {
  readonly rule: PolicyRule;
  readonly passed: boolean;
  readonly score: number;
  readonly reason: string;
}

export interface ProfileCoverage {
  readonly policyId: PolicyProfile['policyId'];
  readonly totalRules: number;
  readonly passingRules: number;
  readonly score: number;
}

const normalizePenalty = (penalty: number): number => {
  if (!Number.isFinite(penalty)) {
    return 1;
  }
  return Math.max(0, Math.min(5, penalty));
};

const evaluateCondition = (rule: PolicyRule, context: RuleContext): boolean => {
  if (!rule.enabled) {
    return true;
  }
  if (rule.condition.includes('critical_signal')) {
    return context.criticalSignals <= 1;
  }
  if (rule.condition.includes('coverage_gap')) {
    return context.coverage >= 0.5;
  }
  if (rule.condition.includes('band=')) {
    const target = rule.condition.split('band=')[1] as SeverityBand;
    return target === context.band;
  }
  if (rule.condition.includes('signal>=')) {
    const limit = Number(rule.condition.split('>=')[1]);
    return context.activeSignals >= (Number.isFinite(limit) ? limit : 0);
  }
  return true;
};

export const evaluatePolicyRule = (rule: PolicyRule, context: RuleContext): RuleEvaluation => {
  const passed = evaluateCondition(rule, context);
  const weight = clampPolicyRatio(100 - normalizePenalty(rule.penaltyPoints));
  const score = passed ? weight : -weight;
  const reason = passed ? 'Rule satisfied' : `Rule violated: ${rule.condition}`;
  return { rule, passed, score, reason };
};

export const evaluatePolicyProfile = (profile: PolicyProfile, context: RuleContext): ProfileCoverage => {
  const evaluations = profile.rules.map((rule) => evaluatePolicyRule(rule, context));
  const passingRules = evaluations.filter((entry) => entry.passed).length;
  const maxScore = profile.rules.length * 5;
  const rawScore = evaluations.reduce((sum, entry) => sum + entry.score, 0);
  const score = maxScore > 0 ? clampPolicyRatio((rawScore + maxScore) / 2) / 20 : 0;
  return {
    policyId: profile.policyId,
    totalRules: profile.rules.length,
    passingRules,
    score,
  };
};

export const rankProfiles = (profiles: readonly PolicyProfile[], context: RuleContext): readonly { readonly policyId: PolicyProfile['policyId']; readonly score: number }[] => {
  return profiles
    .map((profile) => {
      const evaluation = evaluatePolicyProfile(profile, context);
      return {
        policyId: profile.policyId,
        score: evaluation.score,
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const summarizeRules = (rules: readonly RuleEvaluation[]) => {
  const passed = rules.filter((entry) => entry.passed);
  return {
    total: rules.length,
    passed: passed.length,
    failed: rules.length - passed.length,
    score: rules.reduce((sum, entry) => sum + entry.score, 0),
  };
};

export const findBlockingRules = (rules: readonly RuleEvaluation[]) => {
  return rules
    .filter((entry) => !entry.passed)
    .map((entry) => ({
      ruleId: entry.rule.id,
      reason: entry.reason,
      penalty: entry.score,
    }));
};

export const mergeRuleSummaries = (left: readonly RuleEvaluation[], right: readonly RuleEvaluation[]) => {
  const byId = new Map<string, RuleEvaluation>();
  for (const entry of [...left, ...right]) {
    byId.set(entry.rule.id, entry);
  }
  return [...byId.values()];
};

export const buildRuleIndex = (rules: readonly PolicyRule[]): Readonly<Record<string, PolicyRule>> => {
  const map: Record<string, PolicyRule> = {};
  for (const rule of rules) {
    map[rule.id] = rule;
  }
  return map;
};
