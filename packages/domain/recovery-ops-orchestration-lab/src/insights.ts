import type {
  OrchestrationLab,
  PlanScore,
  TimelineEvent,
  LabPlan,
  LabSignal,
  CommandPolicyId,
} from './types';
import { collectTimelineEvents, buildSegments, latestEvent } from './timeline';
import { signalSignalRisk, evaluatePolicy } from './policy';

export interface LabInsights {
  readonly totalSignals: number;
  readonly criticalSignals: number;
  readonly signalRiskIndex: number;
  readonly planDensity: number;
  readonly topPlan: string | undefined;
  readonly lastDecision: string | undefined;
  readonly eventCounts: { readonly signal: number; readonly plan: number; readonly run: number; readonly decision: number };
  readonly topPlanAllowed: boolean;
}

const countEvents = (events: readonly TimelineEvent[]) => {
  const grouped: Record<TimelineEvent['kind'], number> = {
    signal: 0,
    plan: 0,
    run: 0,
    decision: 0,
  };

  for (const event of events) {
    grouped[event.kind] += 1;
  }

  return grouped;
};

const topPlanByScore = (scores: readonly PlanScore[]): LabPlan['id'] | undefined => {
  const best = [...scores].sort((left, right) => right.readiness - left.readiness)[0];
  return best?.planId;
};

export const summarizeLab = (lab: OrchestrationLab, scores: readonly PlanScore[], selectedPlan?: LabPlan): LabInsights => {
  const events = collectTimelineEvents(lab);
  const grouped = countEvents(events);
  const criticalSignals = lab.signals.filter((signal) => signal.tier === 'critical').length;
  const signalRiskIndex = signalSignalRisk(lab.signals);

  return {
    totalSignals: lab.signals.length,
    criticalSignals,
    signalRiskIndex,
    planDensity: lab.plans.length / Math.max(1, lab.windows.length),
    topPlan: topPlanByScore(scores),
    lastDecision: latestEvent(events)?.detail,
    eventCounts: grouped,
    topPlanAllowed: selectedPlan
        ? evaluatePolicy(
          {
            id: `${lab.id}:policy` as CommandPolicyId,
            tenantId: lab.tenantId,
            maxParallelSteps: 8,
            minConfidence: 0.4,
            allowedTiers: ['signal', 'warning', 'critical'],
            minWindowMinutes: 10,
            timeoutMinutes: 180,
          },
          selectedPlan,
        ).allowed
      : false,
  };
};

export const makeSegments = (lab: OrchestrationLab): ReturnType<typeof buildSegments> => buildSegments(collectTimelineEvents(lab));

export const orderSignalsByScore = (signals: readonly LabSignal[]): readonly LabSignal[] =>
  [...signals].sort((left, right) => right.score - left.score);

export const estimateThroughput = (scores: readonly PlanScore[]): number => {
  if (scores.length === 0) {
    return 0;
  }
  const total = scores.reduce((acc, score) => acc + score.readiness + score.resilience + score.controlImpact, 0);
  return Number((total / (scores.length * 3)).toFixed(2));
};
