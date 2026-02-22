import { VerificationAttempt, VerificationReceipt, VerifiedAttempt, VerificationContext, IdentityProvider, ChallengeSeed } from './models';
import { Brand, NonEmptyArray } from '@shared/type-level';

export type ProviderWeight = {
  provider: IdentityProvider;
  weight: number;
};

export interface RiskFrame {
  regionRisk: number;
  deviceRisk: number;
  behaviorRisk: number;
  externalSignals: Record<string, number>;
}

export interface CheckContext {
  attempt: VerificationAttempt;
  risk: RiskFrame;
}

export interface CheckResult {
  passed: boolean;
  provider: IdentityProvider;
  score: number;
  reasons: readonly string[];
  evidence: Record<string, unknown>;
}

export function makeSeed(userId: Brand<string, 'user-id'>): ChallengeSeed {
  return {
    value: `${userId}-seed` as Brand<string, 'challenge-seed'>,
    ttlMs: 5 * 60_000,
  };
}

export function providerWeights(context: VerificationContext): NonEmptyArray<ProviderWeight> {
  const regionBoost = context.ip.startsWith('10.') ? 0.2 : 0.8;
  return [
    { provider: 'password', weight: 0.2 },
    { provider: 'totp', weight: 0.7 * regionBoost },
    { provider: 'sms', weight: 0.4 },
    { provider: 'email', weight: 0.4 },
    { provider: 'biometric', weight: 0.6 },
    { provider: 'webauthn', weight: 0.9 },
  ];
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function aggregateSignals(attempt: VerificationAttempt): number {
  const attemptsPenalty = Math.min(attempt.factors.length * 0.05, 0.2);
  const elapsedPenalty = Math.min(Math.max(attempt.finishedAt ? attempt.finishedAt.getTime() - attempt.startedAt.getTime() : 0, 0) / 300_000, 0.25);
  const contextPenalty = attempt.context.sessionId.length % 4 === 0 ? 0.1 : 0.05;
  return clamp(1 - attemptsPenalty - elapsedPenalty - contextPenalty);
}

export function runChecks(input: CheckContext): CheckResult[] {
  const base = aggregateSignals(input.attempt);
  const checks = providerWeights(input.attempt.context).map((item) => {
    const reasons: string[] = [];
    const risk = 1 - input.risk.regionRisk;
    const riskBonus = Math.max(input.risk.behaviorRisk, input.risk.deviceRisk);
    const score = clamp(base * item.weight * 0.7 + risk * 0.2 + (1 - riskBonus) * 0.1);
    if (score < 0.3) reasons.push('low-confidence');
    if (input.risk.regionRisk > 0.7) reasons.push('geo-risk');
    if (input.attempt.factors.some((x) => x.provider === item.provider) === false) reasons.push('missing-factor-probe');
    return {
      passed: score > 0.5,
      provider: item.provider,
      score,
      reasons,
      evidence: {
        base,
        risk,
        weight: item.weight,
      },
    };
  });

  return checks;
}

export function reduceRisk(input: CheckContext, checks: CheckResult[]): RiskFrame {
  const reduced = checks.reduce(
    (acc, current) => {
      acc.regionRisk = Math.max(acc.regionRisk, 1 - current.score);
      acc.deviceRisk = Math.min(acc.deviceRisk + (current.passed ? 0 : 0.15), 1);
      acc.behaviorRisk = Math.min(acc.behaviorRisk + (current.reasons.includes('geo-risk') ? 0.2 : 0.03), 1);
      return acc;
    },
    { ...input.risk },
  );
  return reduced;
}

export function buildReceipt(attempt: VerificationAttempt, checks: CheckResult[]): VerificationReceipt {
  const sorted = [...checks].sort((a, b) => b.score - a.score);
  const score = sorted.reduce((acc, check) => acc + check.score, 0) / Math.max(sorted.length, 1);
  return {
    attemptId: attempt.id,
    context: attempt.context,
    factorsUsed: sorted.map((item) => item.provider),
    score,
    metadata: {
      providersAttempted: sorted.length,
      successful: sorted.filter((value) => value.passed).length,
      risks: sorted.map((value) => value.reasons.join('|')).join(','),
    },
  };
}

export function finalizeAttempt(attempt: VerificationAttempt, checks: CheckResult[]): VerifiedAttempt | null {
  const receipt = buildReceipt(attempt, checks);
  const allGood = receipt.score >= 0.65 && checks.every((item) => item.score > 0.25);
  if (!allGood) return null;
  return {
    attemptId: attempt.id,
    status: 'verified',
    proof: JSON.stringify(receipt),
  };
}
