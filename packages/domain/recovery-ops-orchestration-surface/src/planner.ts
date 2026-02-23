import type {
  CommandPlanProfile,
  CommandSelectionCriteria,
  CommandSurface,
  CommandOrchestrationResult,
  CommandCoverageMetric,
  CommandPolicyViolation,
  CommandSurfaceEnvelope,
  CommandPlanSummary,
  CommandRisk,
  CommandWave,
  WindowViolation,
  RecoveryCommandPhase,
} from './types';

import { satisfiesRiskTolerance, normalizeRisk, rankRisk } from './policy';

interface CandidateProjection {
  readonly plan: CommandPlanProfile;
  readonly score: number;
  readonly risk: CommandRisk;
  readonly blockers: readonly string[];
}

const buildCoverageMetrics = (waves: readonly CommandWave[]): readonly CommandCoverageMetric[] => {
  const coverageByPhase = new Map<string, { covered: number; total: number }>();

  for (const wave of waves) {
    for (const step of wave.steps) {
      const row = coverageByPhase.get(step.phase) ?? { covered: 0, total: 0 };
      coverageByPhase.set(step.phase, {
        covered: row.covered + (step.estimatedMinutes > 0 ? 1 : 0),
        total: row.total + 1,
      });
    }
  }

  return [...coverageByPhase.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phase, values]: [string, { covered: number; total: number }]) => ({
      phase: phase as RecoveryCommandPhase,
      coveredStepCount: values.covered,
      totalStepCount: values.total,
    }));
};

const evaluateWindowCompliance = (surface: CommandSurface): readonly WindowViolation[] => {
  const start = new Date(surface.runtimeWindow.start).getTime();
  const end = new Date(surface.runtimeWindow.end).getTime();
  const violations: WindowViolation[] = [];

  if (end <= start) {
    violations.push({ reason: 'runtime window end must be after start', time: surface.runtimeWindow.end });
  }

  const withinWindow = (value: string) => {
    const time = new Date(value).getTime();
    return time >= start && time <= end;
  };

  for (const blackout of surface.runtimeWindow.blackoutWindows) {
    if (!withinWindow(blackout.from) || !withinWindow(blackout.to) || blackout.to <= blackout.from) {
      violations.push({ reason: `invalid blackout window ${blackout.from}..${blackout.to}`, time: blackout.from });
    }
  }

  if (surface.runtimeWindow.targetRecoveryMinutes <= 0) {
    violations.push({ reason: 'target recovery minutes must be positive', time: surface.runtimeWindow.end });
  }

  return violations;
};

const scoreWaveSet = (waves: readonly CommandWave[]): number => {
  const riskWeight = waves.reduce((total, wave) => {
    const criticalCount = wave.steps.filter((step) => step.criticality === 'critical').length;
    const highCount = wave.steps.filter((step) => step.criticality === 'high').length;
    const mediumCount = wave.steps.filter((step) => step.criticality === 'medium').length;
    const base = 100 - (criticalCount * 20 + highCount * 8 + mediumCount * 3);
    return total + Math.max(0, base);
  }, 0);

  const speedScore = waves.reduce((acc, wave) => {
    const maxMinutePenalty = Math.max(1, wave.expectedDurationMinutes);
    return acc + Math.max(1, 120 - maxMinutePenalty) / 1.2;
  }, 0);

  const densityScore = waves.reduce((acc, wave) => {
    const denom = Math.max(1, wave.steps.length);
    const concurrencyRatio = wave.parallelism / denom;
    return acc + (concurrencyRatio + wave.steps.length * 0.9);
  }, 0);

  return Math.round((riskWeight + speedScore + densityScore) / waves.length);
};

const validateCandidate = (
  candidate: CommandPlanProfile,
  criteria: CommandSelectionCriteria,
): readonly string[] => {
  const blockers: string[] = [];

  if (candidate.waves.length === 0) {
    blockers.push('plan has no waves');
  }

  const estimatedTotal = candidate.waves.reduce((sum, wave) => sum + wave.expectedDurationMinutes, 0);
  if (criteria.maxPlanMinutes > 0 && estimatedTotal > criteria.maxPlanMinutes) {
    blockers.push(`duration ${estimatedTotal} exceeds max ${criteria.maxPlanMinutes}`);
  }

  const phaseCoverage = new Set(candidate.waves.flatMap((wave) => wave.steps.map((step) => step.phase)));
  const missingPhases = criteria.preferredPhases.filter((phase) => !phaseCoverage.has(phase));
  if (missingPhases.length > 0) {
    blockers.push(`missing preferred phases: ${missingPhases.join(', ')}`);
  }

  const meetsRisk = satisfiesRiskTolerance(candidate.riskLevel, normalizeRisk(criteria.riskTolerance));
  if (!meetsRisk) {
    blockers.push(`risk ${candidate.riskLevel} exceeds ${criteria.riskTolerance}`);
  }

  return blockers;
};

const projectCandidate = (candidate: CommandPlanProfile): CommandPlanSummary => ({
  id: candidate.id,
  score: scoreWaveSet(candidate.waves),
  risk: candidate.riskLevel,
  durationMinutes: candidate.waves.reduce((sum: number, wave: CommandWave) => sum + wave.expectedDurationMinutes, 0),
});

export const rankCandidates = (envelope: CommandSurfaceEnvelope): readonly CandidateProjection[] => {
  return envelope.surface.availablePlans
    .map((plan: CommandPlanProfile) => {
      const blockers = [...validateCandidate(plan, envelope.criteria)];
      const score = projectCandidate(plan).score;
      const riskIndex = rankRisk(plan.riskLevel);
      return {
        plan,
        score,
        risk: plan.riskLevel,
        blockers,
      };
    })
    .sort((a: CandidateProjection, b: CandidateProjection) => {
      if (a.blockers.length !== b.blockers.length) {
        return a.blockers.length - b.blockers.length;
      }
      if (a.risk !== b.risk) {
        const riskDiff = rankRisk(a.risk) - rankRisk(b.risk);
        if (riskDiff !== 0) return riskDiff;
      }
      return b.score - a.score;
    });
};

export const selectPlan = (surface: CommandSurface, criteria: CommandSelectionCriteria): CommandOrchestrationResult => {
  const violations = evaluateWindowCompliance(surface);

  const policyViolations: CommandPolicyViolation[] = violations.map((violation) => ({
    code: 'runtime-window',
    reason: violation.reason,
    severity: 'hard',
  }));

  const ranked = rankCandidates({
    surface,
    policy: {
      requiresApproval: criteria.minConfidence > 0.84,
      maxConcurrentCommands: 6,
      maxRiskLevel: criteria.riskTolerance,
    },
    criteria,
  });

  const winning = ranked[0];
  if (!winning) {
      return {
        ok: false,
      surface,
      chosenPlanId: '' as CommandPlanProfile['id'],
      score: 0,
      riskScore: 0,
      projectedCompletionAt: surface.runtimeWindow.end,
      coverage: [],
      blockers: ['no eligible candidate available'],
    };
  }

  const projectedMinutes = winning.plan.waves.reduce((sum: number, wave) => sum + wave.expectedDurationMinutes, 0);
  const projectedCompletionAt = new Date(Date.now() + projectedMinutes * 60_000).toISOString();
  const coverage = buildCoverageMetrics(winning.plan.waves);

  return {
    ok: winning.blockers.length === 0 && policyViolations.length === 0,
    surface,
    chosenPlanId: winning.plan.id,
    score: winning.score,
    riskScore: rankRisk(winning.risk),
    projectedCompletionAt,
    coverage,
    blockers: [...policyViolations.map((entry) => `${entry.code}:${entry.severity}`), ...winning.blockers],
  };
};

export const buildPlanSummaries = (surface: CommandSurface): readonly CommandPlanSummary[] => {
  return surface.availablePlans
    .map((plan: CommandPlanProfile) => ({
      id: plan.id,
      score: projectCandidate(plan).score,
      risk: plan.riskLevel,
      durationMinutes: projectCandidate(plan).durationMinutes,
    }))
    .sort((a: CommandPlanSummary, b: CommandPlanSummary) => b.score - a.score);
};
