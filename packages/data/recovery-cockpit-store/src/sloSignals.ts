import { Result, fail, ok } from '@shared/result';
import { InMemoryCockpitStore } from './memoryRepository';
import { PlanId } from '@domain/recovery-cockpit-models';
import { normalizeNumber } from '@shared/util';

export type SloSignal = Readonly<{
  signalId: string;
  planId: PlanId;
  at: string;
  severity: 'ok' | 'warn' | 'critical';
  value: number;
  threshold: number;
  message: string;
}>;

const signalFromSample = (planId: PlanId, index: number, eventCount: number): SloSignal => {
  const threshold = 120;
  const value = Math.min(180, 30 + eventCount * 7 + index);
  const severity = value >= threshold ? 'critical' : value >= threshold * 0.85 ? 'warn' : 'ok';
  return {
    signalId: `slo:${planId}:${index}`,
    planId,
    at: new Date().toISOString(),
    severity,
    value: normalizeNumber(value),
    threshold,
    message: `SLO sample ${index} ${severity}`,
  };
};

const mapSeverity = (severity: 'ok' | 'warn' | 'critical'): number =>
  severity === 'critical' ? 3 : severity === 'warn' ? 2 : 1;

export const collectPlanSloSignals = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<ReadonlyArray<SloSignal>, string>> => {
  const planResult = await store.getPlan(planId);
  if (!planResult.ok) {
    return fail(planResult.error);
  }
  if (!planResult.value) {
    return fail('plan-not-found');
  }

  const events = await store.getEvents(planId, 20);
  const signals = events.slice(0, 20).map((event, index) => signalFromSample(planId, index, events.length));
  return ok(signals);
};

export const summarizeSloSignals = (signals: readonly SloSignal[]): string => {
  const severityScore = signals.reduce((acc, signal) => acc + mapSeverity(signal.severity), 0);
  const latest = signals.at(-1);
  const score = normalizeNumber(severityScore / Math.max(1, signals.length));
  return `${signals[0]?.planId ?? 'unknown'} ${signals.length} signals, avg=${score}, latest=${latest?.severity ?? 'none'}`;
};
