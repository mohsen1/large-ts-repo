import { MetricSample, PolicyCondition, PolicyContext, AlertMatch, PolicyRule, AlertSeverity, TenantId, TimestampMs } from './types';

export interface PolicyMatchResult {
  readonly match: boolean;
  readonly score: number;
  readonly reason: string;
}

export const evaluateCondition = (condition: PolicyCondition, value: unknown, sample: PolicyContext): PolicyMatchResult => {
  const normalized = resolvePath(sample.sample, condition.path);
  const expected = condition.threshold;
  const actual = numeric(normalized);

  if (actual == null) {
    return { match: false, score: 0, reason: `missing:${condition.path}` };
  }

  const passed = compare(condition.operator, actual, expected);
  if (!passed) {
    return { match: false, score: 0, reason: `${String(condition.path)} not met` };
  }

  const recency = 1 - Math.max(0, (sample.now - sample.sample.timestamp) / sample.windowSamples.length);
  const score = Math.max(0, Math.min(1, 0.35 + Math.max(0, actual / 2_000) * 0.15 + recency * 0.5));
  return {
    match: true,
    score,
    reason: `${condition.expression} ${condition.operator} ${condition.threshold} on ${String(condition.path)} (${actual})`,
  };
};

export const evaluatePolicy = (rule: PolicyRule, sample: PolicyContext): AlertMatch | null => {
  if (!rule.enabled) return null;
  if (sample.windowSamples.length === 0) return null;
  if (sample.sample.signal !== rule.signal) return null;
  if (!rule.window.end || rule.window.end <= rule.window.start) return null;

  let score = 0;
  const reasons: string[] = [];
  for (const condition of rule.conditions) {
    const matched = evaluateCondition(condition, sample.sample.payload, sample);
    if (!matched.match) {
      return null;
    }
    score += matched.score / rule.conditions.length;
    reasons.push(matched.reason);
  }

  return {
    id: `${rule.id}:${sample.sample.id}:match` as AlertMatch['id'],
    ruleId: rule.id,
    policyName: rule.name,
    tenantId: sample.sample.tenantId,
    score,
    severity: escalateSeverity(rule.severity, score),
    reason: reasons.join('; '),
    createdAt: sample.sample.timestamp,
  };
};

export const rankMatches = (matches: ReadonlyArray<AlertMatch>): AlertMatch[] => {
  return [...matches].sort((left, right) => right.score - left.score || severityWeight(right.severity) - severityWeight(left.severity));
};

export const escalateSeverity = (seed: AlertSeverity, score: number): AlertSeverity => {
  if (seed === 'critical') return 'critical';
  if (seed === 'high' && score > 0.75) return 'critical';
  if (seed === 'medium' && score > 0.82) return 'high';
  if (seed === 'low' && score > 0.9) return 'medium';
  return seed;
};

export const buildTenantPolicySet = (
  tenantId: TenantId,
  rules: ReadonlyArray<PolicyRule>,
): ReadonlyArray<PolicyRule> => {
  return rules.filter((rule) => rule.tenantId === tenantId && rule.enabled);
};

export const metricValue = (metric: MetricSample): number => metric.value;

function compare(operator: PolicyCondition['operator'], lhs: number, rhs: number | string): boolean {
  if (operator === 'eq') return lhs === Number(rhs);
  if (operator === 'lt') return lhs < Number(rhs);
  if (operator === 'lte') return lhs <= Number(rhs);
  if (operator === 'gt') return lhs > Number(rhs);
  if (operator === 'gte') return lhs >= Number(rhs);
  if (operator === 'contains') return String(lhs).includes(String(rhs));
  return false;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolvePath(sample: unknown, path: string): unknown {
  const segments = path.split('.');
  let cursor: unknown = sample;

  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

function severityWeight(severity: AlertSeverity): number {
  if (severity === 'critical') return 4;
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}
