import type { SignalCampaignSignal, CampaignPlan, CampaignRun } from './contracts';

export interface RiskBand {
  readonly id: string;
  readonly score: number;
  readonly label: 'low' | 'moderate' | 'high' | 'critical';
}

export interface CampaignRiskProfile {
  readonly runId: string;
  readonly tenantId: string;
  readonly risk: number;
  readonly band: RiskBand['label'];
  readonly dimensionConcentration: number;
  readonly burstDensity: number;
}

const clampRatio = (value: number): number => Math.max(0, Math.min(1, value));

const concentrationFactor = (signals: readonly SignalCampaignSignal[]): number => {
  const perDimension = new Map<string, number>();
  for (const signal of signals) {
    const current = perDimension.get(signal.dimension) ?? 0;
    perDimension.set(signal.dimension, current + 1);
  }

  const totals = [...perDimension.values()];
  if (totals.length === 0) {
    return 0;
  }
  const peak = Math.max(...totals);
  return clampRatio(peak / signals.length);
};

const burstDensityFactor = (signals: readonly SignalCampaignSignal[]): number => {
  const totalBursts = signals.reduce((acc, signal) => acc + signal.burst, 0);
  return clampRatio(totalBursts / 1000);
};

export const scoreRisk = (
  plan: CampaignPlan,
  run: CampaignRun,
): number => {
  const signalRisk = run.risk + concentrationFactor(plan.signals) + burstDensityFactor(plan.signals) + run.score;
  return Number(clampRatio(signalRisk / 4).toFixed(4));
};

export const toRiskBand = (risk: number): RiskBand['label'] => {
  if (risk >= 0.75) {
    return 'critical';
  }
  if (risk >= 0.5) {
    return 'high';
  }
  if (risk >= 0.25) {
    return 'moderate';
  }
  return 'low';
};

export const buildRiskProfile = (
  tenantId: string,
  plan: CampaignPlan,
  run: CampaignRun,
): CampaignRiskProfile => {
  const score = scoreRisk(plan, run);
  return {
    runId: run.id,
    tenantId,
    risk: score,
    band: toRiskBand(score),
    dimensionConcentration: concentrationFactor(plan.signals),
    burstDensity: burstDensityFactor(plan.signals),
  };
};
