import type { PlaybookDefinition, PlaybookSignal, ReadinessPriority } from './playbook-models';

export interface PlaybookPolicyInput {
  signals: PlaybookSignal[];
  priorities: Set<ReadinessPriority>;
  allowedCategories: ReadonlySet<PlaybookDefinition['category']>;
}

export interface PlaybookEvaluationResult {
  playbookId: string;
  matched: boolean;
  confidence: number;
  reasons: string[];
  recommendedSignals: string[];
  priority: ReadinessPriority;
}

export const defaultPolicyState = {
  minSignalValue: 40,
  minPriority: 'normal' as ReadinessPriority,
  signalCountThreshold: 1,
};

export const priorityScore: Record<ReadinessPriority, number> = {
  low: 0.1,
  normal: 0.3,
  high: 0.7,
  critical: 1,
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const hasCategoryMatch = (playbook: PlaybookDefinition, allowed: ReadonlySet<string>): boolean => {
  if (allowed.size === 0) return true;
  return allowed.has(playbook.category);
};

const signalCoverage = (playbook: PlaybookDefinition, signals: PlaybookSignal[]): number => {
  const required = new Set(playbook.steps.flatMap((step) => step.requiredSignals));
  if (required.size === 0) return 1;
  const observed = new Set(signals.map((signal) => signal.id));
  const covered = [...required].filter((id) => observed.has(id)).length;
  return required.size === 0 ? 0 : covered / required.size;
};

const hasCriticalSignals = (signals: PlaybookSignal[]): boolean => signals.some((signal) => signal.value >= defaultPolicyState.minSignalValue && signal.reliability > 0.9);

export const evaluatePlaybookPolicy = (input: PlaybookPolicyInput, playbook: PlaybookDefinition): PlaybookEvaluationResult => {
  const reasons: string[] = [];
  const signals = input.signals;
  const hasSignals = signals.length >= defaultPolicyState.signalCountThreshold;

  if (!hasSignals) {
    return {
      playbookId: playbook.id,
      matched: false,
      confidence: 0,
      reasons: ['Insufficient signal count'],
      recommendedSignals: [],
      priority: defaultPolicyState.minPriority,
    };
  }

  if (!hasCategoryMatch(playbook, input.allowedCategories)) {
    reasons.push('Category not allowed by policy');
  }

  const hasCritical = hasCriticalSignals(signals);
  const maxPriority = [...input.priorities][0] ?? defaultPolicyState.minPriority;
  if (!input.priorities.has(maxPriority) && maxPriority !== 'low' && maxPriority !== 'normal') {
    reasons.push('Priority mismatch');
  }

  const coverage = signalCoverage(playbook, signals);
  const priorityBoost = Math.max(
    ...signals.map((signal) => priorityScore[signal.value >= 90 ? 'critical' : signal.value >= 75 ? 'high' : signal.value >= 55 ? 'normal' : 'low']),
  );

  const confidence = clamp((coverage * 0.6) + (priorityBoost * 0.3) + (hasCritical ? 0.1 : 0));

  const matched = reasons.length === 0 && coverage > 0 && confidence >= 0.35;
  const recommendedSignals = signals.filter((signal) => signal.value >= defaultPolicyState.minSignalValue).map((signal) => signal.id);

  if (matched) {
    reasons.push('Policy constraints satisfied');
    reasons.push(`Signal coverage ${(coverage * 100).toFixed(0)}%`);
    reasons.push(`Confidence ${(confidence * 100).toFixed(1)}%`);
  }

  return {
    playbookId: playbook.id,
    matched,
    confidence,
    reasons,
    recommendedSignals,
    priority: hasCritical ? 'critical' : maxPriority,
  };
};

export const pickPlaybook = (input: PlaybookPolicyInput, candidates: PlaybookDefinition[]): PlaybookEvaluationResult[] => {
  return candidates
    .map((playbook) => evaluatePlaybookPolicy(input, playbook))
    .filter((result) => result.recommendedSignals.length > 0)
    .sort((left, right) => right.confidence - left.confidence);
};

export const createPolicyWindow = (minutesWindow: number): [number, number] => {
  const now = Date.now();
  const windowStart = Math.max(0, now - minutesWindow * 60_000);
  const windowEnd = now;
  return [windowStart, windowEnd];
};

