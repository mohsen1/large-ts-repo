import type { ForgeExecutionReport, ForgeScenario } from './types';
import { buildExecutionReport } from './planner';
import { simulateBatch, simulateByBudget } from './simulation';
import { evaluateConstraintSet, defaultConstraintSet } from './constraints';

export interface RiskProfile {
  readonly scenarioCount: number;
  readonly signalCount: number;
  readonly averagePolicyScore: number;
  readonly minPolicyScore: number;
  readonly maxPolicyScore: number;
  readonly blockedRate: number;
  readonly constraintDensity: number;
}

export interface RiskForecast {
  readonly profile: RiskProfile;
  readonly summaries: readonly string[];
  readonly recommendations: readonly string[];
}

const toRiskLevel = (score: number, volatility: number): 'low' | 'medium' | 'high' => {
  if (score < 40 || volatility > 70) {
    return 'high';
  }
  if (score < 65 || volatility > 35) {
    return 'medium';
  }
  return 'low';
};

const makeSummaryLine = (index: number, budget: number, score: number): string =>
  `budget=${budget} score=${score.toFixed(1)} run=${index}`;

export const buildRiskProfile = (
  reports: readonly ForgeExecutionReport[],
  violations: number,
): Omit<RiskProfile, 'scenarioCount' | 'signalCount'> => {
  if (reports.length === 0) {
    return {
      averagePolicyScore: 0,
      minPolicyScore: 0,
      maxPolicyScore: 0,
      blockedRate: 0,
      constraintDensity: 0,
    };
  }

  const scores = reports.map((report) => report.policy.riskScore);
  const averagePolicyScore = scores.reduce((acc, score) => acc + score, 0) / scores.length;

  return {
    averagePolicyScore,
    minPolicyScore: Math.min(...scores),
    maxPolicyScore: Math.max(...scores),
    blockedRate: Math.round((scores.filter((value) => value < 40).length / scores.length) * 100),
    constraintDensity: violations / reports.length,
  };
};

export const forecastRisk = (tenant: string, scenarios: readonly ForgeScenario[]): RiskForecast => {
  if (scenarios.length === 0) {
    return {
      profile: {
        scenarioCount: 0,
        signalCount: 0,
        averagePolicyScore: 0,
        minPolicyScore: 0,
        maxPolicyScore: 0,
        blockedRate: 0,
        constraintDensity: 0,
      },
      summaries: [],
      recommendations: [],
    };
  }

  const reports = scenarios.map((scenario) => buildExecutionReport(tenant, scenario));
  const summaryBudgets = [15, 30, 45, 60] as const;
  const summaries = scenarios.flatMap((scenario, scenarioIndex) =>
    simulateByBudget(tenant, scenario, summaryBudgets).runs.map((run, runIndex) =>
      makeSummaryLine(
        scenarioIndex * summaryBudgets.length + runIndex,
        summaryBudgets[runIndex] ?? runIndex,
        run.policyScore,
      ),
    ),
  );
  const summaryRuns = simulateBatch(tenant, scenarios);
  const baseScenario = scenarios[0];
  const constraintCounts = summaryRuns.runs.map(() =>
    evaluateConstraintSet(defaultConstraintSet(), baseScenario, baseScenario.budget).violationCount,
  );
  const violations = constraintCounts.reduce((acc, value) => acc + value, 0);

  const profile = buildRiskProfile(reports, violations);
  const recommendations: string[] = [
    `avg=${profile.averagePolicyScore.toFixed(2)}`,
    `range=${profile.minPolicyScore.toFixed(2)}-${profile.maxPolicyScore.toFixed(2)}`,
    `blocked=${profile.blockedRate}%`,
    `constraints=${profile.constraintDensity}`,
    `risk-level=${toRiskLevel(profile.averagePolicyScore, profile.blockedRate)}`,
  ];

  return {
    profile: {
      scenarioCount: scenarios.length,
      signalCount: scenarios.reduce((acc, scenario) => acc + scenario.signals.length, 0),
      averagePolicyScore: profile.averagePolicyScore,
      minPolicyScore: profile.minPolicyScore,
      maxPolicyScore: profile.maxPolicyScore,
      blockedRate: profile.blockedRate,
      constraintDensity: profile.constraintDensity,
    },
    summaries,
    recommendations,
  };
};
