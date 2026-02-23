import { InMemoryCockpitStore } from './memoryRepository';
import { PlanId, RecoveryPlan, RuntimeRun, CommandEvent } from '@domain/recovery-cockpit-models';
import { listPlans, listRuns, listEvents } from './queries';

export type ArchiveSnapshot = {
  readonly planId: PlanId;
  readonly createdAt: string;
  readonly plan: RecoveryPlan;
  readonly runs: readonly RuntimeRun[];
  readonly events: readonly CommandEvent[];
};

export type ArchiveManifest = {
  readonly entries: number;
  readonly totalRuns: number;
  readonly totalEvents: number;
  readonly capturedAt: string;
};

const serializePlan = (plan: RecoveryPlan): RecoveryPlan => ({
  ...plan,
  labels: {
    ...plan.labels,
    labels: [...plan.labels.labels],
  },
  audit: [...plan.audit],
  actions: plan.actions.map((action) => ({ ...action, tags: [...action.tags], dependencies: [...action.dependencies] })),
});

export const capturePlanArchive = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<ArchiveSnapshot | undefined> => {
  const snapshot = await store.getPlan(planId);
  if (!snapshot.ok || !snapshot.value) {
    return undefined;
  }

  const runs = await listRuns(store, { planId, includeActive: true });
  const events = await listEvents(store, { planId, limit: 250 });

  return {
    planId,
    createdAt: new Date().toISOString(),
    plan: serializePlan(snapshot.value),
    runs,
    events,
  };
};

export const manifestFromStore = async (store: InMemoryCockpitStore): Promise<ArchiveManifest> => {
  const plans = await listPlans(store);
  const snapshotEntries = await Promise.all(
    plans.map(async (plan) => {
      const runs = await listRuns(store, { planId: plan.planId, includeActive: true, limit: 250 });
      const events = await listEvents(store, { planId: plan.planId, limit: 250 });
      return {
        runs: runs.length,
        events: events.length,
      };
    }),
  );

  return {
    entries: plans.length,
    totalRuns: snapshotEntries.reduce((acc, value) => acc + value.runs, 0),
    totalEvents: snapshotEntries.reduce((acc, value) => acc + value.events, 0),
    capturedAt: new Date().toISOString(),
  };
};

export const pruneOldEvents = async (
  store: InMemoryCockpitStore,
  keepPerPlan = 250,
): Promise<ReadonlyArray<PlanId>> => {
  const plans = await store.listPlans();
  if (!plans.ok) {
    return [];
  }

  for (const plan of plans.value) {
    const events = await store.getEvents(plan.planId, Math.max(1, keepPerPlan));
    if (events.length <= keepPerPlan) {
      continue;
    }
    await store.publishEvent({
      eventId: `prune:${plan.planId}:${Date.now()}` as any,
      planId: plan.planId,
      runId: `run:system:${Date.now()}` as any,
      actionId: `system:${plan.planId}` as any,
      at: new Date().toISOString() as any,
      status: 'cancelled',
      reason: `pruned:${events.length}-${keepPerPlan}`,
    });
  }

  return plans.value.map((plan) => plan.planId);
};

export const archiveToText = (snapshot: ArchiveSnapshot): string => {
  return JSON.stringify(
    {
      ...snapshot,
      totalRuns: snapshot.runs.length,
      totalEvents: snapshot.events.length,
    },
    null,
    2,
  );
};

export const parseArchive = (data: string): ArchiveSnapshot => {
  return JSON.parse(data) as ArchiveSnapshot;
};
