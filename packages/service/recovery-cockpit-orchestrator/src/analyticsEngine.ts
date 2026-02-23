import { RecoveryPlan, CommandEvent } from '@domain/recovery-cockpit-models';
import { buildTelemetryEnvelope } from '@data/recovery-cockpit-analytics';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type TelemetrySnapshot = {
  readonly planId: string;
  readonly eventDensity: number;
  readonly health: 'stable' | 'degraded' | 'critical';
  readonly generatedAt: string;
};

const density = (events: readonly CommandEvent[]): number => {
  if (events.length === 0) {
    return 0;
  }
  const failed = events.filter((event) => event.status === 'failed' || event.status === 'cancelled').length;
  const completed = events.filter((event) => event.status === 'completed').length;
  return (failed + completed) / events.length;
};

export const collectTelemetrySnapshot = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
): Promise<TelemetrySnapshot> => {
  const envelope = await buildTelemetryEnvelope(store, plan);
  if (!envelope.ok) {
    return {
      planId: plan.planId,
      eventDensity: 0,
      health: 'critical',
      generatedAt: new Date().toISOString(),
    };
  }

  const events = await store.getEvents(plan.planId, 250);
  const value = density(events);
  return {
    planId: plan.planId,
    eventDensity: value,
    health: envelope.value.healthClass,
    generatedAt: new Date().toISOString(),
  };
};
