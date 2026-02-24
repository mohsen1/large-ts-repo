import { type NoInfer, type UnionToIntersection } from '@shared/type-level';
import { type TenantId, type RecoverySignal, type StageAttempt, type StageAttemptId, createStageAttemptId, type SeverityBand } from './models';

export type RunbookKind = 'preflight' | 'containment' | 'migration' | 'postmortem';
export type RunbookHint = `${string}:${string}`;

export interface RunbookStep<TSignal extends RecoverySignal = RecoverySignal> {
  readonly kind: RunbookKind;
  readonly signal: TSignal['id'];
  readonly reason: string;
  readonly confidence: number;
}

export interface RunbookPolicy<TSignal extends RecoverySignal = RecoverySignal> {
  readonly tenantId: TenantId;
  readonly steps: readonly RunbookStep<TSignal>[];
  readonly severity: SeverityBand;
  readonly canAutoApprove: boolean;
}

export interface PlanCandidate<TSignal extends RecoverySignal = RecoverySignal> {
  readonly id: string;
  readonly policy: RunbookPolicy<TSignal>;
  readonly createdAt: string;
  readonly score: number;
}

const severityWeights: Record<SeverityBand, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
};

const classifySignal = <TSignal extends RecoverySignal>(signal: TSignal): RunbookKind => {
  if (signal.class === 'availability') return 'containment';
  if (signal.class === 'integrity') return 'postmortem';
  if (signal.class === 'compliance') return 'preflight';
  return 'migration';
};

const createPlanId = (tenantId: TenantId, hint: RunbookHint, now: number): string =>
  `${tenantId}:${hint}:${now.toString(16)}`;

export const derivePolicy = <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
  band: SeverityBand,
): RunbookPolicy<TSignals[number]> => {
  const steps = signals
    .filter((signal) => signal.severity === band || band === 'critical')
    .map((signal) => ({
      kind: classifySignal(signal),
      signal: signal.id,
      reason: `${signal.title}:${signal.class}`,
      confidence: Number((severityWeights[signal.severity] / severityWeights[band]).toFixed(4)),
    }));

  return {
    tenantId,
    steps: steps as unknown as readonly RunbookStep<TSignals[number]>[],
    severity: band,
    canAutoApprove: band !== 'critical',
  };
};

export const rankPlan = <TPolicy extends RunbookPolicy>(
  policy: TPolicy,
): number => {
  const base = policy.steps.length * severityWeights[policy.severity];
  const confidence = policy.steps.reduce((acc, step) => acc + step.confidence, 0);
  return Number((base + confidence).toFixed(4));
};

export const buildPlanCandidates = <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): readonly PlanCandidate<TSignals[number]>[] => {
  const bands: readonly SeverityBand[] = ['low', 'medium', 'high', 'critical'];
  return bands.map((band) => {
    const policy = derivePolicy(tenantId, signals, band);
    return {
      id: createPlanId(tenantId, `candidate:${band}`, Date.now()),
      policy,
      createdAt: new Date().toISOString(),
      score: rankPlan(policy),
    };
  });
};

export type PlanMap<TSignals extends readonly RecoverySignal[]> = {
  readonly [K in SeverityBand]: readonly PlanCandidate<TSignals[number]>[];
};

export const compilePlanMap = <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): PlanMap<TSignals> => {
  const candidates = buildPlanCandidates(tenantId, signals);
  const seed = {
    low: [] as readonly PlanCandidate<TSignals[number]>[],
    medium: [] as readonly PlanCandidate<TSignals[number]>[],
    high: [] as readonly PlanCandidate<TSignals[number]>[],
    critical: [] as readonly PlanCandidate<TSignals[number]>[],
  };
  return candidates.reduce((acc, candidate) => {
    const key = candidate.policy.severity;
    const bucket = acc[key];
    return {
      ...acc,
      [key]: [...bucket, candidate] as readonly PlanCandidate<TSignals[number]>[],
    };
  }, seed);
};

export type AttemptEnvelope<TAttempt extends StageAttempt> = {
  readonly attemptId: StageAttemptId;
  readonly attempt: TAttempt;
};

export const makeAttempt = (input: { readonly tenantId: TenantId; readonly label: string }): AttemptEnvelope<StageAttempt> => {
  const attempt: StageAttempt = {
    id: createStageAttemptId(`${input.tenantId}:${input.label}`),
    source: `${input.tenantId}:auto` as never,
    phaseClass: 'prediction',
    severityBand: 'medium',
    normalizedScore: 0,
  };

  return {
    attemptId: attempt.id,
    attempt,
  };
};

export type PolicyTemplate = {
  readonly templateId: string;
  readonly requiredSignals: readonly string[];
  readonly autoApproveThreshold: number;
};

export type PolicyRuntime<TPolicy extends RunbookPolicy> = {
  readonly id: string;
  readonly plan: TPolicy;
  readonly status: 'draft' | 'ready' | 'executed' | 'rejected';
  readonly context: Readonly<Record<string, string>>;
};

const defaultTemplate: PolicyTemplate = {
  templateId: 'default-stress-lab',
  requiredSignals: ['availability', 'performance'],
  autoApproveThreshold: 3,
};

export const activateTemplate = <TTemplate extends PolicyTemplate>(
  template: NoInfer<TTemplate> = defaultTemplate as TTemplate,
): TTemplate => {
  return template;
};

export const executePlan = async <TPolicy extends RunbookPolicy>(
  policy: TPolicy,
  template: NoInfer<PolicyTemplate> = defaultTemplate,
): Promise<PolicyRuntime<TPolicy>> => {
  const status = policy.canAutoApprove && severityWeights[policy.severity] >= template.autoApproveThreshold ? 'ready' : 'draft';
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 1);
  });
  return {
    id: createPlanId(policy.tenantId, `runtime:${template.templateId}`, Date.now()),
    plan: policy as TPolicy,
    status,
    context: {
      template: template.templateId,
      autoApproveThreshold: String(template.autoApproveThreshold),
      requiredSignals: template.requiredSignals.join('|'),
    },
  };
};

export const executePolicies = async <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): Promise<readonly PolicyRuntime<RunbookPolicy<TSignals[number]>>[]> => {
  const candidates = buildPlanCandidates(tenantId, signals);
  const template = activateTemplate();
  const policies = candidates
    .map((candidate) => candidate.policy)
    .filter((policy): policy is RunbookPolicy<TSignals[number]> => policy.steps.length > 0);
  const output: PolicyRuntime<RunbookPolicy<TSignals[number]>>[] = [];

  for (const policy of policies) {
    const runtime = await executePlan(policy, template);
    output.push(runtime);
  }

  return output;
};

export type CandidateBag<TSignals extends readonly RecoverySignal[]> = {
  readonly tenantId: TenantId;
  readonly candidates: readonly PlanCandidate<TSignals[number]>[];
  readonly policies: readonly UnionToIntersection<RunbookPolicy<TSignals[number]>>[];
};

export const summarizeRunbooks = <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId,
  candidates: NoInfer<PlanCandidate<TSignals[number]>[]>,
): CandidateBag<TSignals> => {
  const policies = candidates.map((candidate) => candidate.policy);
  return {
    tenantId,
    candidates,
    policies: policies as readonly UnionToIntersection<RunbookPolicy<TSignals[number]>>[],
  };
};
