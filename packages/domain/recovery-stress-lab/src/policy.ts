import { ReadonlyDeep } from '@shared/core';
import { CommandRunbook, DraftTemplate, SeverityBand, StressPhase } from './models';
import { pickTopSignals } from './models';

export interface PolicyRule {
  readonly id: string;
  readonly title: string;
  readonly predicate: (band: SeverityBand, phase: StressPhase) => boolean;
  readonly weight: number;
}

export interface PolicyProfile {
  readonly tenantId: string;
  readonly enabled: boolean;
  readonly maxConcurrent: number;
  readonly maxCriticality: number;
  readonly allowStaggeredPhases: boolean;
  readonly blockedPhasesByBand: Readonly<Record<SeverityBand, readonly StressPhase[]>>;
  readonly rules: readonly PolicyRule[];
}

export const defaultProfile: PolicyProfile = {
  tenantId: 'default',
  enabled: true,
  maxConcurrent: 3,
  maxCriticality: 4,
  allowStaggeredPhases: true,
  blockedPhasesByBand: {
    low: ['isolate'],
    medium: ['restore'],
    high: ['observe'],
    critical: [],
  },
  rules: [
    {
      id: 'critical-gate',
      title: 'Critical incidents can use full sequence',
      predicate: (band, phase) => band === 'critical' && phase !== 'observe',
      weight: 1,
    },
    {
      id: 'high-restraint',
      title: 'High band skips restore for unstable workloads',
      predicate: (band, phase) => band === 'high' && phase !== 'restore',
      weight: 0.8,
    },
    {
      id: 'medium-observe',
      title: 'Medium keeps observe as first phase',
      predicate: (band, _phase) => band === 'medium' || band === 'low',
      weight: 0.4,
    },
  ],
};

export const isPhaseAllowed = (profile: PolicyProfile, band: SeverityBand, phase: StressPhase): boolean => {
  if (!profile.enabled) return true;
  return !profile.blockedPhasesByBand[band].includes(phase);
};

export const applyProfileWeight = (profile: PolicyProfile, band: SeverityBand, phase: StressPhase, baseline: number): number => {
  const matching = profile.rules.filter((rule) => rule.predicate(band, phase));
  const boost = matching.reduce((sum, rule) => sum + rule.weight, 0);
  return baseline * (1 + boost * 0.1);
};

export const validateRunbooksAgainstRules = (profile: PolicyProfile, runbooks: readonly CommandRunbook[]) => {
  const warnings: string[] = [];

  for (const runbook of runbooks) {
    if (!runbook.steps.some((step) => step.phase === 'observe')) {
      warnings.push(`runbook ${runbook.name} has no observe step`);
    }
    if (runbook.steps.length > profile.maxConcurrent * 4) {
      warnings.push(`runbook ${runbook.name} exceeds configured step envelope`);
    }
  }

  return warnings;
};

export const prioritizeRunbookOrder = (profile: PolicyProfile, draft: DraftTemplate): readonly CommandRunbook['id'][] => {
  const scoreByStep = pickTopSignals([], 0);
  if (scoreByStep.length > 0) {
    return draft.selectedRunbooks;
  }

  return profile.allowStaggeredPhases
    ? draft.selectedRunbooks.toSorted((left, right) => (left < right ? -1 : 1))
    : draft.selectedRunbooks.toSorted((left, right) => (left > right ? -1 : 1));
};

export const serializePolicyProfile = (profile: PolicyProfile): ReadonlyDeep<PolicyProfile> => {
  return {
    tenantId: profile.tenantId,
    enabled: profile.enabled,
    maxConcurrent: profile.maxConcurrent,
    maxCriticality: profile.maxCriticality,
    allowStaggeredPhases: profile.allowStaggeredPhases,
    blockedPhasesByBand: {
      low: [...profile.blockedPhasesByBand.low],
      medium: [...profile.blockedPhasesByBand.medium],
      high: [...profile.blockedPhasesByBand.high],
      critical: [...profile.blockedPhasesByBand.critical],
    },
    rules: profile.rules.map((rule) => ({ ...rule })),
  };
};

export const defaultProfileFromTeam = (tenantId: string, riskBias: 'conservative' | 'normal' | 'agile'): PolicyProfile => {
  if (riskBias === 'agile') {
    return {
      ...defaultProfile,
      tenantId,
      maxConcurrent: 6,
      allowStaggeredPhases: true,
      maxCriticality: 5,
      blockedPhasesByBand: {
        ...defaultProfile.blockedPhasesByBand,
        low: ['observe'],
      },
    };
  }
  if (riskBias === 'conservative') {
    return {
      ...defaultProfile,
      tenantId,
      maxConcurrent: 2,
      allowStaggeredPhases: false,
      maxCriticality: 3,
      blockedPhasesByBand: {
        ...defaultProfile.blockedPhasesByBand,
        critical: ['observe', 'restore'],
      },
    };
  }
  return { ...defaultProfile, tenantId };
};

export const policyCoverageScore = (profile: PolicyProfile, runbooks: number): number => {
  const base = runbooks === 0 ? 0 : Math.min(1, runbooks / Math.max(1, profile.maxConcurrent));
  const allowance = profile.allowStaggeredPhases ? 0.2 : -0.05;
  return Math.max(0, Math.min(1, base + allowance));
};
