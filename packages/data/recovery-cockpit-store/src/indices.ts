import { RecoveryPlan, PlanId, RecoveryAction, RuntimeRun } from '@domain/recovery-cockpit-models';
import { PlanListCriteria, listPlans } from './queries';
import { InMemoryCockpitStore } from './memoryRepository';

export type TextIndexEntry = {
  readonly planId: PlanId;
  readonly tokens: readonly string[];
  readonly updatedAt: string;
};

export type PlanIndex = {
  readonly byService: ReadonlyMap<string, PlanId[]>;
  readonly byTag: ReadonlyMap<string, PlanId[]>;
  readonly byRegion: ReadonlyMap<string, PlanId[]>;
  readonly byRiskLabel: ReadonlyMap<string, PlanId[]>;
};

const include = (index: Map<string, Set<PlanId>>, key: string, planId: PlanId): void => {
  const bucket = index.get(key) ?? new Set();
  bucket.add(planId);
  index.set(key, bucket);
};

export const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((value) => value.length > 0);
};

const serviceKey = (action: RecoveryAction): string => `${action.serviceCode}:${action.region}`;

export const buildIndex = (plans: readonly RecoveryPlan[]): PlanIndex => {
  const byService = new Map<string, Set<PlanId>>();
  const byTag = new Map<string, Set<PlanId>>();
  const byRegion = new Map<string, Set<PlanId>>();
  const byRiskLabel = new Map<string, Set<PlanId>>();

  for (const plan of plans) {
    const risk = plan.isSafe ? 'safe' : 'unsafe';
    include(byRiskLabel, risk, plan.planId);

    for (const action of plan.actions) {
      include(byService, serviceKey(action), plan.planId);
      include(byRegion, action.region, plan.planId);
      for (const tag of action.tags) {
        include(byTag, tag, plan.planId);
      }
    }
  }

  return {
    byService: new Map(Array.from(byService.entries()).map(([key, value]) => [key, Array.from(value)])),
    byTag: new Map(Array.from(byTag.entries()).map(([key, value]) => [key, Array.from(value)])),
    byRegion: new Map(Array.from(byRegion.entries()).map(([key, value]) => [key, Array.from(value)])),
    byRiskLabel: new Map(Array.from(byRiskLabel.entries()).map(([key, value]) => [key, Array.from(value)])),
  };
};

export const findPlanIdsByToken = (index: PlanIndex, token: string): PlanId[] => {
  const direct = index.byTag.get(token) ?? [];
  if (direct.length > 0) {
    return [...direct];
  }
  const byService = index.byService.get(token) ?? [];
  const byRegion = index.byRegion.get(token) ?? [];
  const combined = new Set<PlanId>([...byService, ...byRegion, ...(index.byRiskLabel.get(token) ?? [])]);
  return Array.from(combined);
};

export const buildTextSearchIndex = (plans: readonly RecoveryPlan[]): ReadonlyArray<TextIndexEntry> => {
  return plans.map((plan) => {
    const tokens = new Set([
      ...tokenize(plan.title),
      ...tokenize(plan.labels.long),
      ...tokenize(plan.labels.short),
      ...plan.labels.labels.flatMap((value) => tokenize(value)),
    ]);
    return { planId: plan.planId, tokens: [...tokens], updatedAt: new Date().toISOString() };
  });
};

export const queryPlansByText = async (
  store: InMemoryCockpitStore,
  text: string,
  criteria: PlanListCriteria = {},
): Promise<PlanId[]> => {
  const plans = await listPlans(store, criteria);
  const indexes = buildTextSearchIndex(plans);
  const normalized = new Set(tokenize(text));

  const matching = plans
    .filter((plan) => {
      const entry = indexes.find((item) => item.planId === plan.planId);
      if (!entry) return false;
      return [...normalized].some((token) => entry.tokens.includes(token));
    })
    .map((plan) => plan.planId);

  return matching;
};

export const collectRunMetrics = (runs: readonly RuntimeRun[]): { total: number; failed: number; meanActions: number } => {
  const total = runs.length;
  const failed = runs.filter((run) => run.state === 'failed').length;
  const completedActions = runs.reduce((acc, run) => acc + run.completedActions.length, 0);
  return {
    total,
    failed,
    meanActions: total === 0 ? 0 : Number((completedActions / total).toFixed(2)),
  };
};
