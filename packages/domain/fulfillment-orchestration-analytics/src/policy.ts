import { FulfillmentStressStrategy, WorkloadScenario, ForecastPlan } from './models';

export type StrategyProfile = {
  strategy: FulfillmentStressStrategy;
  priority: number;
  label: string;
  conditions: readonly string[];
};

export interface StrategySwitchRule {
  whenDemandAbove: number;
  whenRiskAbove: number;
  switchTo: FulfillmentStressStrategy;
}

export interface PolicyEnvelope {
  tenantId: string;
  activeStrategy: FulfillmentStressStrategy;
  candidates: readonly StrategyProfile[];
  switches: readonly StrategySwitchRule[];
  generatedAt: string;
}

const profiles: readonly StrategyProfile[] = [
  { strategy: 'baseline', priority: 1, label: 'Balanced throughput', conditions: ['risk<40', 'utilization<80'] },
  { strategy: 'burst', priority: 2, label: 'Scale workers fast', conditions: ['risk>=40', 'utilization>=80', 'forecast>120%'] },
  { strategy: 'throttle', priority: 3, label: 'Reduce intake', conditions: ['risk>=60', 'capacity<100%'] },
  { strategy: 'preposition', priority: 4, label: 'Preload stock and labor', conditions: ['risk<20', 'forecast rising'] },
];

export const resolveScenario = (scenario: WorkloadScenario, windows: readonly { backlogRisk: number }[]): FulfillmentStressStrategy => {
  const maxRisk = Math.max(...windows.map((window) => window.backlogRisk), 0);
  if (maxRisk > 70) return 'burst';
  if (maxRisk > 55 && scenario.score < 30) return 'preposition';
  if (maxRisk > 55) return 'throttle';
  if (scenario.score > 85 && maxRisk < 25) return 'baseline';
  return 'baseline';
};

export const evaluatePolicy = (plan: ForecastPlan, riskScore: number): PolicyEnvelope => {
  const recommended = profiles.map((profile) => ({
    ...profile,
    conditions: [...profile.conditions],
  }));

  const switches: StrategySwitchRule[] = [
    { whenDemandAbove: 0.75, whenRiskAbove: 0.6, switchTo: 'burst' },
    { whenDemandAbove: 1.15, whenRiskAbove: 0.8, switchTo: 'throttle' },
    { whenDemandAbove: 0.45, whenRiskAbove: 0.4, switchTo: 'preposition' },
  ];

  const activeStrategy = recommended.reduce<StrategyProfile>((selected, candidate) => {
    if (candidate.priority <= selected.priority) return selected;
    return candidate;
  }, recommended[0] ?? { strategy: 'baseline', priority: 99, label: 'fallback', conditions: [] });

  return {
    tenantId: plan.tenantId,
    activeStrategy: activeStrategy.strategy,
    candidates: recommended.filter((candidate) => candidate.priority <= 4),
    switches,
    generatedAt: new Date().toISOString(),
  };
};
