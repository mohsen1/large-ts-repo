import type { SignalObservation, ServiceDependencyNode } from './types';

export interface RiskFactor {
  readonly dependency: ServiceDependencyNode;
  readonly signalImpact: number;
}

export interface RiskAssessment {
  readonly riskScore: number;
  readonly riskBand: 'safe' | 'watch' | 'alert' | 'critical';
  readonly factors: readonly RiskFactor[];
}

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

const toSignalWeight = (signal: SignalObservation): number => {
  const severityWeight = signal.severity / 5;
  return clamp01(severityWeight * signal.confidence);
};

export const evaluateRisk = (signals: readonly SignalObservation[], dependencies: readonly ServiceDependencyNode[]): RiskAssessment => {
  const signalWeights = signals.map((signal) => toSignalWeight(signal));
  const meanSignal = signalWeights.length === 0 ? 0 : signalWeights.reduce((acc, value) => acc + value, 0) / signalWeights.length;

  const factors = dependencies.map((dependency, index) => ({
    dependency,
    signalImpact: (signalWeights[index % signalWeights.length] ?? meanSignal) * dependency.blastRadiusMultiplier,
  }));

  const averageImpact = factors.length === 0 ? 0 : factors.reduce((acc, next) => acc + next.signalImpact, 0) / factors.length;
  const riskScore = clamp01(averageImpact) * 100;

  const riskBand =
    riskScore >= 80
      ? 'critical'
      : riskScore >= 60
        ? 'alert'
        : riskScore >= 35
          ? 'watch'
          : 'safe';

  return { riskScore, riskBand, factors };
};

export const forecastedDowntime = (assessment: RiskAssessment): number => {
  return Math.round(assessment.riskScore * 2.2);
};
