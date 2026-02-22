import type { HealthGrade } from './models';

export interface ComponentRisk {
  readonly componentId: string;
  readonly probability: number;
  readonly impact: number;
  readonly recoveryComplexity: number;
}

export interface DecisionEnvelope {
  readonly riskScore: number;
  readonly stabilityGrade: HealthGrade;
  readonly hardStop: boolean;
  readonly warnings: ReadonlyArray<string>;
  readonly componentRisks: ReadonlyArray<ComponentRisk>;
}

export const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export const deriveRiskScore = (
  probabilities: ReadonlyArray<number>,
  impacts: ReadonlyArray<number>,
): number => {
  if (probabilities.length === 0 || impacts.length === 0) return 0;
  const weighted = probabilities
    .slice(0, impacts.length)
    .reduce((sum, probability, index) => {
      const impact = impacts[index] ?? 0;
      return sum + clamp01(probability) * clamp01(impact / 100);
    }, 0);
  return Math.round((weighted / probabilities.length) * 10000) / 100;
};

export const computeDecisionEnvelope = (
  riskScore: number,
  componentRisks: ReadonlyArray<ComponentRisk>,
): DecisionEnvelope => {
  const normalized = clamp01(riskScore / 100);
  const stabilityGrade: HealthGrade =
    normalized >= 0.9 ? 'green' :
    normalized >= 0.7 ? 'yellow' :
    normalized >= 0.5 ? 'orange' :
    'red';

  const hardStop = normalized < 0.25;

  const warnings: string[] = [];
  if (hardStop) {
    warnings.push('hard stop due to critical instability');
  }
  if (componentRisks.some((item) => item.impact > 80)) {
    warnings.push('high impact dependencies detected');
  }
  if (componentRisks.some((item) => item.recoveryComplexity > 8)) {
    warnings.push('complex recovery path with multiple blast radius points');
  }

  return {
    riskScore,
    stabilityGrade,
    hardStop,
    warnings,
    componentRisks,
  };
};
