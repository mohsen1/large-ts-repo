import type {
  QuantumPolicy,
  QuantumPolicyId,
  QuantumSeverity,
  QuantumSignal,
  QuantumScope,
  QuantumPlan,
  QuantumStep,
  QuantumRunbook,
  SeverityWeight,
  QuantumTenantId,
} from './types';
import { Brand } from '@shared/type-level';

export type QuantumPolicyTemplate = {
  readonly tenant: QuantumTenantId;
  readonly title: string;
  readonly scope: readonly QuantumScope[];
  readonly weight: number;
  readonly severity: QuantumSeverity;
};

export type PolicyTemplateBySeverity<S extends QuantumSeverity> = S extends 'critical' | 'high'
  ? 3 | 4 | 5
  : S extends 'medium'
    ? 2
    : 1;

export const policyWeight = (severity: QuantumSeverity): PolicyTemplateBySeverity<typeof severity> => {
  return (severity === 'critical' || severity === 'high' ? 5 : severity === 'medium' ? 3 : 1) as PolicyTemplateBySeverity<
    typeof severity
  >;
};

export const createPolicyFromTemplate = (template: QuantumPolicyTemplate): QuantumPolicy => {
  const tags = template.scope.map((scope) => scope.tags.join('|'));
  return {
    id: `${template.tenant}:policy:${template.title.toLowerCase().replace(/\s+/g, '-')}` as QuantumPolicyId,
    tenant: template.tenant,
    title: template.title,
    weight: policyWeight(template.severity) ?? template.weight,
    scope: template.scope,
  };
};

export const scorePolicy = (policy: QuantumPolicy, overrides: Partial<SeverityWeight> = {}): number => {
  const base = policy.weight;
  const scopeBoost = policy.scope.length * 0.33;
  const severityMultiplier = Object.entries(overrides).reduce((acc, [severity, score]) => {
    if (severity === 'critical') {
      return acc + score * 0.4;
    }
    if (severity === 'high') {
      return acc + score * 0.3;
    }
    if (severity === 'medium') {
      return acc + score * 0.15;
    }
    return acc + score * 0.05;
  }, 0);
  return base + scopeBoost + severityMultiplier;
};

export const normalizePolicyPlan = (policy: QuantumPolicy, plan: QuantumPlan): QuantumPolicy => ({
  ...policy,
  title: policy.title.trim(),
  scope: policy.scope.filter((scope) => scope.name.length > 0),
  weight: scorePolicy(policy),
});

export const attachPolicies = (runbook: QuantumRunbook, policies: readonly QuantumPolicyTemplate[]): QuantumRunbook => {
  const mapped = policies.map((template) => createPolicyFromTemplate(template));
  return {
    ...runbook,
    policies: mapped,
    metadata: {
      ...runbook.metadata,
      policyCount: String(mapped.length),
    },
  };
};

export const policyCoverage = (signals: readonly QuantumSignal[], policies: readonly QuantumPolicy[]): number => {
  if (signals.length === 0) {
    return 0;
  }
  const tags = new Set(policies.flatMap((policy) => policy.scope.flatMap((scope) => scope.tags)));
  return Number((signals.filter((signal) => signal.payload && tags.has(signal.dimension)).length / signals.length).toFixed(4));
};

export type RankedPolicy = QuantumPolicy & {
  readonly score: number;
};

export const rankPolicies = (policies: readonly QuantumPolicy[]): RankedPolicy[] =>
  policies
    .map((policy) => ({
      ...policy,
      score: scorePolicy(policy),
    }))
    .sort((left, right) => right.score - left.score);

export const policySignalMap = <
  TMap extends Record<string, { signal: QuantumSignal; policy: QuantumPolicy }>,
>(
  policy: QuantumPolicy,
  signal: QuantumSignal,
  bucket: TMap,
): TMap => {
  const entryId = `${policy.id}:${signal.id}` as const;
  return {
    ...bucket,
    [entryId]: { signal, policy },
  } as TMap;
};

export const policyTimeline = (signal: QuantumSignal, policy: QuantumPolicy): QuantumStep[] =>
  signal.score > 0
    ? [
        {
          id: `${signal.id}:phase:ingest` as Brand<string, 'quantum-step-id'>,
          signalId: signal.id,
          command: `bind:${policy.id}`,
          expectedLatencyMs: Math.max(signal.score * 100, 200),
        },
      ]
    : [];
