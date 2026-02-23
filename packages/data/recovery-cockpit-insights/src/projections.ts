import { RecoveryPlan, RuntimeRun, CockpitSignal, SignalDigest } from '@domain/recovery-cockpit-models';
import { scoreFromSignals } from '@domain/recovery-cockpit-intelligence';
import { healthFromScores, CockpitInsight, PlanInsight } from './insightModels';

export type ProjectionInput = {
  readonly plan: RecoveryPlan;
  readonly runs: readonly RuntimeRun[];
  readonly signals: readonly CockpitSignal[];
  readonly forecastSummary: number;
};

export const computeInsightScore = (
  plan: RecoveryPlan,
  signals: readonly CockpitSignal[],
  forecastSummary: number,
): { risk: number; readiness: number; policy: number } => {
  const risk = Math.max(0, 120 - plan.slaMinutes + scoreFromSignals(signals));
  const readiness = Math.max(0, Math.min(100, forecastSummary));
  const policy = plan.isSafe ? 100 : 60;
  return { risk, readiness, policy };
};

export const projectInsight = ({ plan, runs, signals, forecastSummary }: ProjectionInput): PlanInsight => {
  const scores = computeInsightScore(plan, signals, forecastSummary);
  const reasons = [
    `actions=${plan.actions.length}`,
    `sla=${plan.slaMinutes}`,
    `signalScore=${scoreFromSignals(signals)}`,
  ];
  return {
    planId: plan.planId,
    summary: `${plan.labels.short} with ${plan.actions.length} actions`,
    createdAt: new Date().toISOString(),
    runCount: runs.length,
    latestRunState: runs.at(-1)?.state,
    forecastSummary,
    score: {
      planId: plan.planId,
      risk: scores.risk,
      readiness: scores.readiness,
      policy: scores.policy,
      health: healthFromScores(scores.readiness, scores.risk),
      reasons,
    },
  };
};

export const buildCockpitInsight = (
  plan: RecoveryPlan,
  runs: readonly RuntimeRun[],
  signals: readonly CockpitSignal[],
  forecastSummary: number,
): CockpitInsight => ({
  plan,
  insight: projectInsight({ plan, runs, signals, forecastSummary }),
  forecast: forecastSummary,
  signals,
});

export const buildRunTimeline = (runs: readonly RuntimeRun[]): ReadonlyArray<string> =>
  runs.map((run) => `${run.runId}:${run.state}:${run.startedAt}`);

export const summarizePlanInsights = (insights: readonly PlanInsight[]): Readonly<Record<'green' | 'yellow' | 'red', number>> => {
  const summary: Record<'green' | 'yellow' | 'red', number> = { green: 0, yellow: 0, red: 0 };
  for (const insight of insights) {
    summary[insight.score.health] += 1;
  }
  return summary;
};

export const planHealthSignalCount = (insights: readonly PlanInsight[], health: 'green' | 'yellow' | 'red'): number =>
  insights.filter((insight) => insight.score.health === health).length;

export const summarizeSignalsByType = (signals: readonly CockpitSignal[]): string => {
  const grouped = new Map<string, number>();
  for (const signal of signals) {
    if ('code' in signal) {
      grouped.set(`operational:${signal.code}`, (grouped.get(`operational:${signal.code}`) ?? 0) + 1);
    } else if ('title' in signal) {
      grouped.set(`forecast:${signal.signalId}`, (grouped.get(`forecast:${signal.signalId}`) ?? 0) + 1);
    } else {
      grouped.set('unknown', (grouped.get('unknown') ?? 0) + 1);
    }
  }
  return [...grouped.entries()].map(([key, value]) => `${key}=${value}`).join(',');
};

export const toCockpitSignalDigest = (signals: readonly CockpitSignal[]): SignalDigest => ({
  timestamp: new Date().toISOString() as SignalDigest['timestamp'],
  activeCount: signals.length,
  criticalCount: signals.filter((signal) => 'severity' in signal && signal.severity === 'critical').length,
  mutedCount: signals.length - signals.filter((signal) => 'severity' in signal && signal.severity === 'info').length,
  signals,
});
