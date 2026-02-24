import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan, RecoveryAction, PlanId } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from './memoryRepository';
import { normalizeNumber } from '@shared/util';

export type ScenarioCacheEntry = Readonly<{
  readonly planId: PlanId;
  readonly builtAt: string;
  readonly actionCount: number;
  readonly topologyNodeCount: number;
  readonly criticalNodes: ReadonlyArray<string>;
  readonly readinessHints: ReadonlyArray<{ nodeId: string; score: number }>;
}>;

type CacheRecord = {
  readonly value: ScenarioCacheEntry;
  readonly hash: string;
};

const cache = new Map<PlanId, CacheRecord>();

const hashPlan = (plan: RecoveryPlan): string => {
  const normalized = [
    plan.planId,
    plan.title,
    plan.actions.length,
    plan.actions.map((action) => `${action.id}:${action.expectedDurationMinutes}`).join(', '),
  ].join('|');
  return normalized;
};

const estimateActionRisk = (action: RecoveryPlan['actions'][number]): number => {
  const criticalBoost = action.tags.includes('critical') ? 35 : 5;
  return normalizeNumber((criticalBoost + action.tags.length * 2 + action.dependencies.length * 3 + action.expectedDurationMinutes * 0.4) / 10);
};

const scoreFromPlan = (plan: RecoveryPlan): ReadonlyArray<{ nodeId: string; score: number }> =>
  plan.actions.map((action) => ({ nodeId: action.id, score: estimateActionRisk(action) }));

export const upsertScenarioCache = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<ScenarioCacheEntry, string>> => {
  const existingPlan = await store.getPlan(planId);
  if (!existingPlan.ok) {
    return fail(existingPlan.error);
  }
  if (!existingPlan.value) {
    return fail('plan-not-found');
  }

  const plan = existingPlan.value;
  const criticalNodes = plan.actions.filter((action) => action.tags.includes('critical')).map((action) => action.id);
  const readinessHints = scoreFromPlan(plan);

  const entry: ScenarioCacheEntry = {
    planId,
    builtAt: new Date().toISOString(),
    actionCount: plan.actions.length,
    topologyNodeCount: plan.actions.length,
    criticalNodes,
    readinessHints,
  };

  const fingerprint = hashPlan(plan);
  cache.set(planId, { value: entry, hash: fingerprint });
  return ok(entry);
};

export const loadScenarioCache = (planId: PlanId, plan?: RecoveryPlan): ScenarioCacheEntry | undefined => {
  if (!cache.has(planId) && plan) {
    const entry: ScenarioCacheEntry = {
      planId,
      builtAt: new Date().toISOString(),
      actionCount: plan.actions.length,
      topologyNodeCount: plan.actions.length,
      criticalNodes: plan.actions.filter((action) => action.tags.includes('critical')).map((action) => action.id),
      readinessHints: scoreFromPlan(plan),
    };
    cache.set(planId, { value: entry, hash: hashPlan(plan) });
  }
  return cache.get(planId)?.value;
};

export const evictScenarioCache = (planId: PlanId): boolean => {
  return cache.delete(planId);
};

export const listScenarioCache = (): ReadonlyArray<ScenarioCacheEntry> => {
  return [...cache.values()].map((record) => record.value);
};

export const refreshScenarioCache = async (store: InMemoryCockpitStore): Promise<Result<ReadonlyArray<ScenarioCacheEntry>, string>> => {
  const plansResult = await store.listPlans();
  if (!plansResult.ok) {
    return fail(plansResult.error);
  }

  const values: ScenarioCacheEntry[] = [];
  for (const plan of plansResult.value) {
    const entryResult = await upsertScenarioCache(store, plan.planId);
    if (entryResult.ok) {
      values.push(entryResult.value);
    }
  }

  return ok(values);
};

export const findCachedCriticalNodeIds = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<ReadonlyArray<RecoveryAction['id']>, string>> => {
  const cacheEntry = loadScenarioCache(planId);
  if (cacheEntry) {
    return ok(cacheEntry.criticalNodes as readonly RecoveryAction['id'][]);
  }
  const refreshed = await upsertScenarioCache(store, planId);
  if (!refreshed.ok) {
    return fail(refreshed.error);
  }

  return ok(refreshed.value.criticalNodes as readonly RecoveryAction['id'][]);
};
