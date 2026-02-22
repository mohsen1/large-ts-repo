import { withBrand } from '@shared/core';
import type { CadencePlanCandidate, CadenceRunPlan, CadenceEvaluation } from './types';
import { calculateConcurrencyPeak, calculateWindowCoverage, estimateAverageDuration, toNumeric } from './utility';
import { validateTopology } from './topology';

export interface CadencePolicyRule {
  readonly id: string;
  readonly name: string;
  readonly severity: 'info' | 'warn' | 'block';
  readonly check: (candidate: CadencePlanCandidate) => string[];
}

export interface CadencePolicyEngine {
  readonly rules: readonly CadencePolicyRule[];
  evaluate(candidate: CadencePlanCandidate): CadenceEvaluation;
  recommend(candidate: CadencePlanCandidate): readonly string[];
}

const defaultRules = (): readonly CadencePolicyRule[] => [
  {
    id: 'coverage.min.95',
    name: 'Window coverage must stay high',
    severity: 'warn',
    check(candidate) {
      const coverage = calculateWindowCoverage({
        windows: candidate.profile.windows,
        slots: candidate.profile.slots,
      });
      if (coverage < 0.8) {
        return ['Coverage below 80%'];
      }
      return [];
    },
  },
  {
    id: 'concurrency.bound',
    name: 'Concurrency must not exceed allowed limit',
    severity: 'block',
    check(candidate) {
      const maxConcurrent = candidate.profile.windows.reduce((acc, window) => Math.max(acc, window.maxParallelism), 0);
      const actual = calculateConcurrencyPeak(candidate.profile.slots);
      return actual > maxConcurrent * 2
        ? [`Peak concurrency ${actual} exceeds max ${maxConcurrent * 2}`]
        : [];
    },
  },
  {
    id: 'retry.bound',
    name: 'Retries bounded by 6',
    severity: 'warn',
    check(candidate) {
      return candidate.profile.windows
        .filter((window) => window.maxRetries > 6)
        .map((window) => `Window ${String(window.id)} maxRetries ${window.maxRetries}`);
    },
  },
  {
    id: 'duration.max',
    name: 'Slot durations should be bounded',
    severity: 'warn',
    check(candidate) {
      return candidate.profile.slots
        .filter((slot) => slot.estimatedMinutes > 360)
        .map((slot) => `Slot ${String(slot.id)} duration ${slot.estimatedMinutes} exceeds bounds`);
    },
  },
];

const collectRuleSignals = (candidate: CadencePlanCandidate): string[] =>
  defaultRules().flatMap((rule) => {
    const messages = rule.check(candidate);
    return messages.map((message) => `${rule.name}: ${message}`);
  });

const calculateScore = (candidate: CadencePlanCandidate): number => {
  const topology = validateTopology(candidate);
  const basePenalty = topology.errors.length * 12;
  const windowCoverage = calculateWindowCoverage({
    windows: candidate.profile.windows,
    slots: candidate.profile.slots,
  });
  const averageSlot = estimateAverageDuration(candidate.profile.slots);
  const concurrency = calculateConcurrencyPeak(candidate.profile.slots);
  const complexityPenalty = Math.max(0, candidate.profile.slots.length - 10);
  const durationPenalty = Math.max(0, averageSlot - 90);
  const healthFactor = toNumeric(candidate.profile.windows.length, 1) + toNumeric(candidate.profile.slots.length, 1);

  const raw = (windowCoverage * 45) - basePenalty - complexityPenalty - (durationPenalty * 0.2) - (concurrency * 2);
  return Number(Math.max(0, Math.min(100, raw / Math.max(1, healthFactor))).toFixed(3));
};

const isRuleBlocking = (candidate: CadencePlanCandidate): string[] => {
  const topology = validateTopology(candidate);
  const hard = defaultRules().filter((rule) => rule.severity === 'block');

  return hard.flatMap((rule) => rule.check(candidate)).concat(
    topology.ok ? [] : topology.errors,
  );
};

export class DefaultCadencePolicyEngine implements CadencePolicyEngine {
  constructor(public readonly rules: readonly CadencePolicyRule[] = defaultRules()) {}

  evaluate(candidate: CadencePlanCandidate): CadenceEvaluation {
    const signals = collectRuleSignals(candidate);
    const hard = isRuleBlocking(candidate);
    const warnings = signals.filter((signal) => signal.includes('warn') || signal.includes('Duration') || signal.includes('Retries') || signal.includes('coverage'));
    const score = calculateScore(candidate);

    return {
      ok: hard.length === 0,
      reasons: hard,
      score,
      warnings,
    };
  }

  recommend(candidate: CadencePlanCandidate): readonly string[] {
    const topology = validateTopology(candidate);
    const reasons: string[] = [];

    if (!topology.ok) {
      reasons.push('Resolve dependency and window topology issues before planning');
    }

    if (candidate.profile.windows.length < 2) {
      reasons.push('Add at least two windows to distribute execution');
    }

    if (candidate.profile.slots.length < 3) {
      reasons.push('Increase slot count for better resilience coverage');
    }

    const averageDuration = estimateAverageDuration(candidate.profile.slots);
    if (averageDuration > 60) {
      reasons.push('Consider splitting long slots into smaller execution units');
    }

    const coverage = calculateWindowCoverage({
      windows: candidate.profile.windows,
      slots: candidate.profile.slots,
    });
    if (coverage < 1) {
      reasons.push('Assign at least one slot per window for complete cadence coverage');
    }

    return reasons;
  }
}

export const evaluateCadence = (candidate: CadencePlanCandidate): CadenceEvaluation => {
  return new DefaultCadencePolicyEngine().evaluate(candidate);
};

export const attachPolicyFingerprint = (evaluation: CadenceEvaluation, candidate: CadencePlanCandidate): CadenceRunPlan => ({
  id: withBrand(`cadence-${candidate.revision}`, 'RecoveryCadenceId'),
  runId: withBrand(`run-${candidate.revision}`, 'CadenceRunId'),
  profile: candidate.profile,
  candidateHash: withBrand(`${candidate.revision}:${candidate.profile.slots.length}`, 'CadenceCandidateHash'),
  constraintFingerprint: withBrand(`${candidate.constraints.length}-${candidate.notes.length}`, 'CadenceConstraintFingerprint'),
  createdAt: new Date().toISOString(),
  outcome: evaluation.ok ? 'ready' : 'deferred',
  slots: candidate.profile.slots,
  windows: candidate.profile.windows,
  readinessScore: evaluation.score,
  policySummary: {
    enabledConstraints: candidate.constraints.filter((constraint) => constraint.enabled).length,
    blockedByRules: evaluation.reasons,
    warnings: evaluation.warnings,
  },
  audit: {
    createdBy: candidate.profile.source,
    reviewedBy: [withBrand('cadence-engine', 'UserId')],
    approved: evaluation.ok,
    approvedAt: evaluation.ok ? new Date().toISOString() : undefined,
    reasonTrail: [...evaluation.reasons, ...evaluation.warnings],
  },
});
