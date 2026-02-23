import type { ContinuityReadinessCoverage, ContinuityReadinessCandidatePlan } from './types';

const baseWeight = (input: string): number => {
  const score = [...input].reduce((total, char) => total + char.charCodeAt(0), 0);
  return (score % 10) + 1;
};

export const buildCoverageWeights = (plans: readonly ContinuityReadinessCandidatePlan[]): number[] => {
  const weights = plans.map((plan) => {
    const signalPressure = plan.signals.reduce((sum, signal) => sum + signal.severity + signal.impact, 0);
    const commandLength = plan.runbook.reduce((sum, step) => sum + step.command.length, 0);
    const titleWeight = baseWeight(plan.label);
    return Math.max(1, Math.min(40, (signalPressure / Math.max(1, plan.signals.length)) + titleWeight + commandLength / 120));
  });

  return weights;
};

export const aggregateCoverageRisk = (coverages: readonly ContinuityReadinessCoverage[]): number => {
  if (coverages.length === 0) {
    return 0;
  }

  const score = coverages.reduce((sum, coverage) => sum + coverage.score * coverage.weight, 0);
  const totalWeight = coverages.reduce((sum, coverage) => sum + coverage.weight, 0);
  return totalWeight === 0 ? 0 : Number((score / totalWeight).toFixed(2));
};

export const sortCoverage = (coverages: readonly ContinuityReadinessCoverage[]): ContinuityReadinessCoverage[] => {
  const riskSort = ['low', 'medium', 'high', 'critical'];
  return [...coverages].sort((left, right) => {
    const riskDelta = riskSort.indexOf(left.riskBand) - riskSort.indexOf(right.riskBand);
    if (riskDelta !== 0) {
      return riskDelta;
    }
    return right.score - left.score;
  });
};

export const summarizeCoverage = (coverages: readonly ContinuityReadinessCoverage[]): string => {
  if (coverages.length === 0) {
    return 'No objective coverage available';
  }
  const best = sortCoverage(coverages)[0];
  return `${coverages.length} objective coverages; best ${best.objectiveName} score=${best.score} (${best.riskBand})`;
};
