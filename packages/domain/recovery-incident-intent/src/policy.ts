import { type NoInfer } from '@shared/type-level';
import {
  type IncidentContext,
  type IncidentIntentCandidate,
  type IncidentIntentPolicy,
  type IncidentIntentSignal,
  type IncidentIntentStepInput,
  type IncidentIntentStepOutput,
  type PolicyWeights,
  createIntentPolicyId,
  createIntentStepId,
} from './types';

export type RankedCandidate = Readonly<{
  candidate: IncidentIntentCandidate;
  score: number;
}>;

const DEFAULT_WEIGHTS: PolicyWeights = {
  severity: 1.7,
  freshness: 1.2,
  confidence: 2.2,
  cost: -1.4,
};

const normalizePolicyTags = (input: readonly string[]): readonly string[] =>
  [...new Set(input.map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.toLowerCase()))];

const signalAgeMs = (signal: IncidentIntentSignal): number => {
  const observed = new Date(signal.observedAt).getTime();
  return Number.isFinite(observed) ? Date.now() - observed : Number.POSITIVE_INFINITY;
};

const confidencePenalty = (candidate: IncidentIntentCandidate, policy: IncidentIntentPolicy): number =>
  candidate.confidence < policy.minimumConfidence
    ? (policy.minimumConfidence - candidate.confidence) * 12
    : 0;

export const evaluateCandidateScore = (
  candidate: IncidentIntentCandidate,
  signals: readonly IncidentIntentSignal[],
  policy: IncidentIntentPolicy,
  weights: PolicyWeights = DEFAULT_WEIGHTS,
): number => {
  const signalAges = signals.map(signalAgeMs).filter(Number.isFinite);
  const freshest = signalAges.length === 0 ? 1 : Math.max(1, Math.min(...signalAges));
  const freshness = 100 / freshest;
  const tagBoost = candidate.rationale.includes(policy.policyId as string) ? 4 : 0;
  return (
    (candidate.confidence * weights.confidence) +
    (signals.length * weights.severity) +
    (freshness * weights.freshness) +
    tagBoost +
    confidencePenalty(candidate, policy) +
    weights.cost
  ) / Math.max(1, policy.tags.length + 1);
};

const toRanked = (
  candidates: readonly IncidentIntentCandidate[],
  context: {
    tenantId: IncidentContext['tenantId'];
    signals: readonly IncidentIntentSignal[];
    policy: IncidentIntentPolicy;
  },
): readonly RankedCandidate[] =>
  candidates
    .map((candidate) => ({
      candidate,
      score: evaluateCandidateScore(candidate, context.signals, context.policy),
    }))
    .toSorted((left, right) => right.score - left.score);

export const selectPolicy = (
  policies: readonly IncidentIntentPolicy[],
  context: {
    tenantId: IncidentContext['tenantId'];
    context: IncidentContext;
    signals: readonly IncidentIntentSignal[];
  },
): readonly RankedCandidate[] => {
  const outputs: RankedCandidate[] = [];
  for (const policy of policies) {
    const candidates = context.context.tags.map((tag): IncidentIntentCandidate => ({
      kind: tag,
      confidence: Math.min(1, Math.max(0, context.context.tenantId.length / 100)),
      rationale: `${policy.title}:${tag}`,
    }));
    outputs.push(
      ...toRanked(candidates, {
        tenantId: context.tenantId,
        signals: context.signals,
        policy,
      }),
    );
  }
  return outputs.toSorted((left, right) => right.score - left.score);
};

export const buildPolicy = (policy: {
  title: string;
  minimumConfidence: number;
  tags: Iterable<string>;
}): IncidentIntentPolicy => {
  const tags = normalizePolicyTags([...policy.tags, ...policy.title.split('-').filter(Boolean)]);
  const policyId = createIntentPolicyId(`${policy.title.toLowerCase().replace(/\s+/g, '-')}-${tags.length}`);
  return {
    policyId,
    title: policy.title,
    minimumConfidence: Math.max(0, Math.min(1, policy.minimumConfidence)),
    weight: { ...DEFAULT_WEIGHTS },
    tags,
  };
};

export const buildPolicyTuple = <const T extends readonly IncidentIntentPolicy[]>(
  policies: T,
): readonly IncidentIntentPolicy[] => {
  const tuple = policies.length > 0 ? policies : [buildPolicy({ title: 'default', minimumConfidence: 0.5, tags: ['default'] })] as const;
  return [...tuple];
};

export const policySupports = (
  manifest: { readonly context: { readonly severity: IncidentContext['severity']; meta: IncidentContext['meta'] } },
  policy: IncidentIntentPolicy,
): boolean => {
  const severityWeightPass = manifest.context.severity === 'p1'
    ? policy.weight.severity > 1.4
    : true;
  const ownerTag = manifest.context.meta.owner;
  return severityWeightPass && policy.tags.includes(ownerTag);
};

export const summarizePolicyBundle = (policy: IncidentIntentPolicy): string => {
  return `${policy.policyId as string}:${policy.title}:${policy.minimumConfidence}:${policy.tags.join(',')}`;
};

export const planFromSignals = <TInput extends NoInfer<IncidentIntentStepInput>>(
  input: TInput,
  policy: IncidentIntentPolicy,
): IncidentIntentStepOutput => {
  const validSignals = input.signals.filter((signal) => signal.kind !== 'manual');
  const ranked = selectPolicy([policy], {
    tenantId: input.context.tenantId,
    context: input.context,
    signals: validSignals,
  });

  const top = ranked[0]?.candidate ?? {
    kind: policy.policyId as string,
    confidence: 0,
    rationale: 'default',
  };
  const duration = validSignals.reduce((acc, signal) => acc + signal.value, 0);
  const status: IncidentIntentSignal = validSignals[0]!;

  return {
    generatedAt: new Date().toISOString(),
    stepId: createIntentStepId(`policy-${policy.policyId as string}`, top.kind.length),
    kind: 'synthesize',
    durationMs: Number.isFinite(duration) ? duration : 0,
    status: policy.minimumConfidence > top.confidence ? 'degraded' : 'queued',
    output: `${policy.title} -> ${top.rationale} (${top.confidence.toFixed(2)})`,
  };
};
