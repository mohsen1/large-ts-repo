import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildHealthMatrix } from './planHealthMatrix';
import { buildDependencyGraph, buildCriticalPath } from './dependencyGraph';
import { buildRiskForecast } from './riskForecast';
import { evaluatePlanPolicies } from './policies';
import { toTimestamp, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';

export type NarrativeTone = 'steady' | 'assertive' | 'cautious' | 'alert';

export type NarrativeFragment = {
  readonly heading: string;
  readonly tone: NarrativeTone;
  readonly lines: readonly string[];
};

export type PlanNarrative = {
  readonly planId: string;
  readonly generatedAt: UtcIsoTimestamp;
  readonly severity: HealthScore;
  readonly score: number;
  readonly fragments: readonly NarrativeFragment[];
};

export type HealthScore = 'green' | 'yellow' | 'orange' | 'red';

const classify = (value: number): HealthScore => {
  if (value >= 80) return 'green';
  if (value >= 60) return 'yellow';
  if (value >= 35) return 'orange';
  return 'red';
};

const policyLines = (plan: RecoveryPlan): readonly string[] => {
  const checks = evaluatePlanPolicies(plan, 'advisory');
  const denied = checks.filter((check) => !check.allowed);
  const lines: string[] = [];

  for (const check of checks) {
    if (!check.allowed) {
      lines.push(`${check.check}: ${check.violations.join(', ')}`);
    }
    if (check.recommendations.length > 0) {
      lines.push(`${check.check} recommendation=${check.recommendations[0]}`);
    }
  }

  if (denied.length === 0) {
    lines.push('policy checks clean for advisory mode');
  }
  return lines;
};

const dependencyLines = (plan: RecoveryPlan): readonly string[] => {
  const graph = buildDependencyGraph(plan.actions);
  const criticalPath = buildCriticalPath(graph);
  const riskSignals: string[] = [];

  riskSignals.push(`nodes=${graph.nodes.size}`);
  riskSignals.push(`criticalPath=${criticalPath.length}`);

  const cycles = new Map<string, number>();
  for (const [id, node] of graph.nodes) {
    const fanout = node.dependents.size;
    if (fanout >= 2) {
      cycles.set(id, fanout);
    }
  }

  if (cycles.size > 0) {
    riskSignals.push(`fanout hotspots=${[...cycles.entries()].map(([id, fanout]) => `${id}:${fanout}`).join(',')}`);
  }

  if (criticalPath.length > 0) {
    riskSignals.push(`criticalHead=${criticalPath[criticalPath.length - 1]}`);
  }

  return riskSignals;
};

const signalLines = (plan: RecoveryPlan): readonly string[] => {
  const actionCount = plan.actions.length;
  const warnings = plan.actions.filter((action) => action.command.includes('warn')).length;
  const kills = plan.actions.filter((action) => action.command.includes('kill')).length;
  const retries = plan.actions.reduce((acc, action) => acc + action.retriesAllowed, 0);
  return [
    `actionCount=${actionCount}`,
    `warningSignals=${warnings}`,
    `killCandidates=${kills}`,
    `retryBudget=${retries}`,
  ];
};

const forecastLines = (plan: RecoveryPlan): readonly string[] => {
  const forecast = buildRiskForecast(plan, 'advisory');
  const criticalWindows = forecast.windows.filter((entry) => entry.band === 'critical').length;
  const peak = forecast.peakRisk;
  const rising = forecast.windows.filter((entry, index, all) => index > 0 && entry.totalRisk > all[index - 1]!.totalRisk).length;
  return [
    `forecastPeak=${peak.toFixed(1)}`,
    `criticalWindows=${criticalWindows}`,
    `riskTrendUpSteps=${rising}`,
    `signalExposure=${forecast.summary.signals.toFixed(1)}`,
  ];
};

const matrixFragment = (plan: RecoveryPlan): NarrativeFragment => {
  const matrix = buildHealthMatrix(plan, [], {
    policyMode: 'advisory',
    includeSignals: false,
    signalCap: 12,
  });

  const lines = matrix.cells.map((cell) => `${cell.axis}:${cell.score.toFixed(1)}(bucket=${cell.bucket})`);
  return {
    heading: `Health matrix score=${matrix.score.toFixed(1)}`,
    tone: matrix.severityBand === 'low' ? 'steady' : matrix.severityBand === 'medium' ? 'assertive' : matrix.severityBand === 'high' ? 'cautious' : 'alert',
    lines,
  };
};

const narrativeTone = (score: number): NarrativeTone => {
  if (score >= 75) return 'steady';
  if (score >= 55) return 'assertive';
  if (score >= 30) return 'cautious';
  return 'alert';
};

export const composeNarrative = (plan: RecoveryPlan, includeSignals = false): PlanNarrative => {
  const policy = policyLines(plan);
  const dependency = dependencyLines(plan);
  const signals = signalLines(plan);
  const forecast = forecastLines(plan);
  const matrix = matrixFragment(plan);

  const fragments: NarrativeFragment[] = [
    {
      heading: 'Policy posture',
      tone: policy.length > 2 ? 'assertive' : 'steady',
      lines: policy,
    },
    {
      heading: 'Dependency posture',
      tone: dependency.length > 4 ? 'cautious' : 'steady',
      lines: dependency,
    },
    {
      heading: 'Operational posture',
      tone: includeSignals ? 'alert' : 'steady',
      lines: signals,
    },
    {
      heading: 'Forecast posture',
      tone: forecast.length > 2 ? 'cautious' : 'assertive',
      lines: forecast,
    },
    matrix,
  ];

  const score = buildRiskForecast(plan, 'advisory').summary.overallRisk;
  const severity = classify(score);
  return {
    planId: plan.planId,
    generatedAt: toTimestamp(new Date()),
    severity,
    score,
    fragments,
  };
};

export const printNarrative = (plan: RecoveryPlan): string => {
  const narrative = composeNarrative(plan, true);
  const lines = narrative.fragments.flatMap((fragment) => [fragment.heading, ...fragment.lines]);
  const summary = lines.slice(0, 8).join(' | ');
  const tone = narrativeTone(narrative.score);
  return `${tone.toUpperCase()} ${narrative.planId}: ${summary}`;
};
