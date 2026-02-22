import type { SimulationEnvelope, ScenarioCandidate, ScenarioBudget, ValidationSummary, RecoveryPlanWindow } from './incident-models';

export interface ConstraintProfile {
  readonly minSignals: number;
  readonly minConfidence: number;
  readonly maxRiskScore: number;
  readonly maxWindowMinutes: number;
  readonly minWindowMinutes: number;
  readonly allowUnverified: boolean;
}

export interface ConstraintState {
  readonly profile: ConstraintProfile;
  readonly disabled: readonly string[];
  readonly featureFlags: readonly string[];
}

export interface ConstraintAssessment {
  readonly candidateId: string;
  readonly result: ValidationSummary;
  readonly windows: readonly RecoveryPlanWindow[];
}

const safeNumber = (value: number, min = 0, max = Number.POSITIVE_INFINITY): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const hasRequiredSignals = (candidate: ScenarioCandidate, minSignals: number): ValidationSummary => {
  const signalCount = candidate.template.signals.length;
  if (signalCount >= minSignals) {
    return {
      candidateId: candidate.scenarioId,
      passed: true,
      blockedReasons: [],
      warnings: signalCount > minSignals ? [] : ['signal_count_threshold_at_minimum'],
    };
  }

  return {
    candidateId: candidate.scenarioId,
    passed: false,
    blockedReasons: ['insufficient_signal_coverage'],
    warnings: ['insufficient_signals'],
  };
};

const assertConfidence = (candidate: ScenarioCandidate, profile: ConstraintProfile): ValidationSummary => {
  const confidence = candidate.planWindow.confidence;
  const expected = safeNumber(profile.minConfidence, 0, 100);
  if (confidence >= expected) {
    return {
      candidateId: candidate.scenarioId,
      passed: true,
      blockedReasons: [],
      warnings: confidence > 80 ? [] : ['moderate_confidence'],
    };
  }

  return {
    candidateId: candidate.scenarioId,
    passed: false,
    blockedReasons: ['low_confidence'],
    warnings: ['confidence_below_threshold'],
  };
};

const assertWindow = (candidate: ScenarioCandidate, profile: ConstraintProfile): ValidationSummary => {
  const windowLength = candidate.planWindow.endMinute - candidate.planWindow.startMinute;
  if (windowLength < profile.minWindowMinutes) {
    return {
      candidateId: candidate.scenarioId,
      passed: false,
      blockedReasons: ['window_too_short'],
      warnings: ['short_window'],
    };
  }

  if (windowLength > profile.maxWindowMinutes) {
    return {
      candidateId: candidate.scenarioId,
      passed: false,
      blockedReasons: ['window_too_long'],
      warnings: ['long_window_risk'],
    };
  }

  return {
    candidateId: candidate.scenarioId,
    passed: true,
    blockedReasons: [],
    warnings: [],
  };
};

const assertBudget = (candidate: ScenarioCandidate, budget: ScenarioBudget): ValidationSummary => {
  if (candidate.budget.maxParallelism <= 0) {
    return {
      candidateId: candidate.scenarioId,
      passed: false,
      blockedReasons: ['invalid_parallelism'],
      warnings: ['parallelism_disabled'],
    };
  }

  if (candidate.budget.riskTolerance < 0) {
    return {
      candidateId: candidate.scenarioId,
      passed: false,
      blockedReasons: ['invalid_risk_tolerance'],
      warnings: ['invalid_budget_value'],
    };
  }

  if (candidate.budget.budgetMinutes < budget.budgetMinutes / 4) {
    return {
      candidateId: candidate.scenarioId,
      passed: false,
      blockedReasons: ['budget_too_small'],
      warnings: ['increase_budget_minutes'],
    };
  }

  if (candidate.budget.budgetCostUnits > budget.budgetCostUnits * 2) {
    return {
      candidateId: candidate.scenarioId,
      passed: false,
      blockedReasons: ['excessive_cost'],
      warnings: ['cost_ratio_high'],
    };
  }

  return {
    candidateId: candidate.scenarioId,
    passed: true,
    blockedReasons: [],
    warnings: [],
  };
};

const assertRiskProfile = (candidate: ScenarioCandidate, profile: ConstraintProfile): ValidationSummary => {
  const maxRisk = safeNumber(profile.maxRiskScore, 0, 100);
  if (candidate.planWindow.riskScore <= maxRisk) {
    return {
      candidateId: candidate.scenarioId,
      passed: true,
      blockedReasons: [],
      warnings: candidate.planWindow.riskScore >= 80 ? ['high_risk'] : [],
    };
  }

  return {
    candidateId: candidate.scenarioId,
    passed: false,
    blockedReasons: ['risk_score_exceeded'],
    warnings: ['risk_too_high'],
  };
};

export const assessCandidateConstraints = (
  candidate: ScenarioCandidate,
  budget: ScenarioBudget,
  profile: ConstraintProfile,
  state: ConstraintState,
): ConstraintAssessment[] => {
  const checks = [
    hasRequiredSignals(candidate, state.profile.minSignals),
    assertConfidence(candidate, profile),
    assertWindow(candidate, profile),
    assertBudget(candidate, budget),
    assertRiskProfile(candidate, profile),
  ];

  const gated = state.disabled.length > 0
    ? {
        candidateId: candidate.scenarioId,
        passed: false,
        blockedReasons: [...state.disabled.map((entry) => `disabled:${entry}`)],
        warnings: [...state.featureFlags],
      }
    : {
        candidateId: candidate.scenarioId,
        passed: true,
        blockedReasons: [],
        warnings: [],
      };

  const summaries = [...checks, gated];
  const windows = candidate.planWindow.riskScore >= profile.maxRiskScore - 10
    ? [
        {
          startMinute: Math.max(0, candidate.planWindow.startMinute - 5),
          endMinute: candidate.planWindow.endMinute + 5,
          confidence: Math.max(20, candidate.planWindow.confidence - 7),
          riskScore: Math.min(profile.maxRiskScore, candidate.planWindow.riskScore + 5),
          signalDensity: candidate.planWindow.signalDensity * 0.85,
          label: 'contingency-buffered',
        },
      ]
    : [];

  return summaries.map((summary): ConstraintAssessment => ({
    candidateId: candidate.scenarioId,
    result: summary,
    windows: windows,
  }));
};

export const summarizeConstraintFailures = (assessments: readonly ConstraintAssessment[]): string[] => {
  const failures = new Set<string>();
  for (const assessment of assessments) {
    for (const reason of assessment.result.blockedReasons) {
      failures.add(reason);
    }
  }
  return [...failures].sort();
};

export const hasBlockingConstraints = (envelope: SimulationEnvelope): boolean => {
  return envelope.checks.some((check) => !check.passed);
};

export const combineConstraintProfile = (
  base: ConstraintProfile,
  overrides?: Partial<ConstraintProfile>,
): ConstraintProfile => ({
  minSignals: overrides?.minSignals ?? base.minSignals,
  minConfidence: overrides?.minConfidence ?? base.minConfidence,
  maxRiskScore: overrides?.maxRiskScore ?? base.maxRiskScore,
  maxWindowMinutes: overrides?.maxWindowMinutes ?? base.maxWindowMinutes,
  minWindowMinutes: overrides?.minWindowMinutes ?? base.minWindowMinutes,
  allowUnverified: overrides?.allowUnverified ?? base.allowUnverified,
});
