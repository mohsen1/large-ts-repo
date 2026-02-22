import type {
  DimensionScores,
  RiskContext,
  RiskDimension,
  RiskFactor,
  RiskRunId,
  RiskSignal,
  RiskAssessment,
  RiskFinding,
} from './types';

const dimensionOrder: RiskDimension[] = ['blastRadius', 'recoveryLatency', 'dataLoss', 'dependencyCoupling', 'compliance'];

const severityThresholds = {
  low: 0,
  medium: 35,
  high: 65,
  critical: 85,
};

const dimensionWeight: Record<RiskDimension, number> = {
  blastRadius: 0.3,
  recoveryLatency: 0.2,
  dataLoss: 0.25,
  dependencyCoupling: 0.15,
  compliance: 0.1,
};

export const computeDimensionScores = (signals: readonly RiskSignal[]): DimensionScores => {
  const scores: Record<RiskDimension, number> = {
    blastRadius: 0.0,
    recoveryLatency: 0.0,
    dataLoss: 0.0,
    dependencyCoupling: 0.0,
    compliance: 0.0,
  };

  for (const signal of signals) {
    const current = scores[signal.dimension] ?? 0;
    const contribution = Math.max(0, Math.min(100, signal.value * signal.weight * 100));
    scores[signal.dimension] = Math.min(100, current + contribution);
  }

  return scores;
};

export const computeRiskScore = (scores: DimensionScores): number => {
  const weighted = dimensionOrder.reduce((sum, dimension) => {
    const score = scores[dimension] ?? 0;
    return sum + score * dimensionWeight[dimension];
  }, 0);
  return Math.max(0, Math.min(100, Math.round(weighted)));
};

export const determineSeverity = (score: number): RiskAssessment['severity'] => {
  if (score >= severityThresholds.critical) return 'critical';
  if (score >= severityThresholds.high) return 'high';
  if (score >= severityThresholds.medium) return 'medium';
  return 'low';
};

export const rankFindings = (scores: DimensionScores, factors: readonly RiskFactor[]): readonly RiskFinding[] =>
  factors
    .map((factor) => {
      const score = Math.max(0, Math.min(100, Math.round((scores[factor.dimension] ?? 0) * factor.impact * factor.confidence)));
      return {
        factorName: factor.name,
        dimension: factor.dimension,
        severity: determineSeverity(score),
        score,
        recommendation: factor.evidence,
      };
    })
    .sort((a, b) => b.score - a.score);

export const buildRiskAssessment = (
  context: RiskContext,
  signals: readonly RiskSignal[],
  factors: readonly RiskFactor[],
): RiskAssessment => {
  const dimensionScores = computeDimensionScores(signals);
  const score = computeRiskScore(dimensionScores);
  return {
    assessmentId: `${context.runId}:assessment` as never,
    profileId: `${context.programId}:profile` as never,
    score,
    dimensionScores,
    severity: determineSeverity(score),
    findings: rankFindings(dimensionScores, factors),
    normalizedAt: new Date().toISOString(),
  };
};

export const buildRiskEnvelope = (
  context: RiskContext,
  signals: readonly RiskSignal[],
  factors: readonly RiskFactor[],
) => ({
  assessment: buildRiskAssessment(context, signals, factors),
  context,
  signals,
});

export const calculateWindow = (runId: RiskRunId, offsetMinutes: number) => {
  const start = new Date(Date.now() + offsetMinutes * 60_000);
  const end = new Date(start.getTime() + 15 * 60_000);
  return {
    validFrom: start.toISOString(),
    validTo: end.toISOString(),
    timezone: 'UTC',
    horizonMinutes: 15,
    runId,
  };
};
