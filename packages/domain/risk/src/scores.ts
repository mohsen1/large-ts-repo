import { RuleInput } from './rules';

export interface RiskProfile {
  userId: string;
  tenantId: string;
  score: number;
  history: RiskScorePoint[];
}

export interface RiskScorePoint {
  at: string;
  value: number;
  reason: string;
}

export const createProfile = (input: RuleInput): RiskProfile => ({
  userId: input.userId,
  tenantId: input.tenantId,
  score: 100,
  history: [],
});

export const updateScore = (profile: RiskProfile, value: number, reason: string): RiskProfile => {
  const next = Math.max(0, Math.min(100, value));
  return {
    ...profile,
    score: next,
    history: [...profile.history, { at: new Date().toISOString(), value: next, reason }],
  };
};

export const classify = (profile: RiskProfile): 'low' | 'medium' | 'high' => {
  if (profile.score > 80) return 'low';
  if (profile.score > 50) return 'medium';
  return 'high';
};

export const aggregate = (profiles: readonly RiskProfile[]): number => {
  if (profiles.length === 0) return 0;
  const total = profiles.reduce((acc, profile) => acc + profile.score, 0);
  return total / profiles.length;
};
