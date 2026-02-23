import type { ForgeExecutionReport } from '@domain/recovery-command-forge';

export interface ForgeMetricRow {
  readonly label: string;
  readonly score: number;
  readonly trend: 'up' | 'down' | 'flat';
}

const trendFromSeries = (current: number, previous: number): 'up' | 'down' | 'flat' => {
  if (current > previous) {
    return 'up';
  }
  if (current < previous) {
    return 'down';
  }
  return 'flat';
};

export const buildMetricRows = (reports: readonly ForgeExecutionReport[]): readonly ForgeMetricRow[] => {
  const sorted = [...reports].sort((left, right) =>
    new Date(left.generatedAt).getTime() - new Date(right.generatedAt).getTime(),
  );

  return sorted.map((entry, index, entries) => {
    const previous = entries[index - 1]?.policy.riskScore;
    return {
      label: `${entry.tenant} #${index + 1}`,
      score: entry.policy.riskScore,
      trend: typeof previous === 'number' ? trendFromSeries(entry.policy.riskScore, previous) : 'flat',
    };
  });
};

export const averagePolicyScore = (reports: readonly ForgeExecutionReport[]): number => {
  if (reports.length === 0) {
    return 0;
  }
  return Math.round(reports.reduce((acc, report) => acc + report.policy.riskScore, 0) / reports.length);
};

export const worstPolicyScore = (reports: readonly ForgeExecutionReport[]): number => {
  if (reports.length === 0) {
    return 0;
  }
  return Math.min(...reports.map((report) => report.policy.riskScore));
};

export const bestPolicyScore = (reports: readonly ForgeExecutionReport[]): number => {
  if (reports.length === 0) {
    return 0;
  }
  return Math.max(...reports.map((report) => report.policy.riskScore));
};

export const constraintDensity = (reports: readonly ForgeExecutionReport[]): number => {
  if (reports.length === 0) {
    return 0;
  }
  const outcomes = reports.reduce((acc, report) => acc + report.outcomes.length, 0);
  return Math.round((outcomes / reports.length) * 10);
};
