import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { RecoveryPlan, CommandEvent, CockpitSignal, PlanId } from '@domain/recovery-cockpit-models';
import { toPercent } from '@shared/util';

type SignalReader = {
  latestSignals(planId: PlanId): Promise<readonly CockpitSignal[]>;
  getInsight?(planId: PlanId): Promise<unknown>;
};

export type SignalCorrelationPoint = {
  readonly planId: string;
  readonly actionFailures: number;
  readonly signalCriticalCount: number;
  readonly eventDensity: number;
  readonly correlation: number;
  readonly confidence: 'low' | 'medium' | 'high';
};

const label = (value: number): 'low' | 'medium' | 'high' => {
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
};

const criticalCount = (signals: readonly CockpitSignal[]): number =>
  signals.filter((signal) => 'severity' in signal && signal.severity === 'critical').length;

const failureCount = (events: readonly CommandEvent[]): number =>
  events.filter((event) => event.status === 'failed').length;

export const correlationForPlan = async (
  plan: RecoveryPlan,
  store: InMemoryCockpitStore,
  insights: SignalReader,
): Promise<SignalCorrelationPoint> => {
  const events = await store.getEvents(plan.planId, 500);
  const signals = await insights.latestSignals(plan.planId);
  const failures = failureCount(events);
  const critical = criticalCount(signals);
  const eventDensity = toPercent(events.length, Math.max(1, plan.actions.length * 3));
  const summary = await (insights.getInsight ? insights.getInsight(plan.planId) : Promise.resolve(undefined));
  const summaryRisk = summary && typeof summary === 'object' && 'score' in summary && (summary as { score?: { risk?: number } }).score?.risk
    ? (summary as { score: { risk: number } }).score.risk
    : 0;
  const correlation = Number(((failures + critical) / Math.max(1, events.length + 1)).toFixed(4));

  return {
    planId: plan.planId,
    actionFailures: failures,
    signalCriticalCount: critical,
    eventDensity,
    correlation,
    confidence: label(correlation + summaryRisk / 200),
  };
};

export const correlateSignals = async (
  plans: readonly RecoveryPlan[],
  store: InMemoryCockpitStore,
  insights: SignalReader,
): Promise<readonly SignalCorrelationPoint[]> => {
  const points: SignalCorrelationPoint[] = [];
  for (const plan of plans) {
    points.push(await correlationForPlan(plan, store, insights));
  }
  return points
    .map((point) => point)
    .sort((left, right) => right.correlation - left.correlation);
};

export const summarizeCorrelations = (points: readonly SignalCorrelationPoint[]): Readonly<Record<'low' | 'medium' | 'high', number>> => {
  const summary: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 0, high: 0 };
  for (const point of points) {
    summary[point.confidence] += 1;
  }
  return summary;
};
