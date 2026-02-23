import { PlanId, RecoveryPlan, RuntimeRun, CommandEvent } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from './memoryRepository';

export type PlanListCriteria = {
  planMode?: 'automated' | 'manual' | 'semi';
  maxSla?: number;
  minActions?: number;
  region?: string;
  requiredTag?: string;
  includeUnsafe?: boolean;
};

export type RunHistoryQuery = {
  planId: PlanId;
  includeActive?: boolean;
  limit?: number;
  states?: readonly RuntimeRun['state'][];
  from?: string;
  to?: string;
};

export type EventQuery = {
  planId: PlanId;
  status?: RuntimeRun['state'] | 'queued' | 'cancelled';
  limit?: number;
  onlyRecent?: boolean;
};

const matchesPlan = (plan: RecoveryPlan, criteria: PlanListCriteria): boolean => {
  if (criteria.planMode && plan.mode !== criteria.planMode) return false;
  if (criteria.maxSla !== undefined && plan.slaMinutes > criteria.maxSla) return false;
  if (criteria.minActions !== undefined && plan.actions.length < criteria.minActions) return false;
  if (criteria.region && !plan.actions.some((action) => action.region === criteria.region)) return false;
  if (criteria.requiredTag && !plan.labels.labels.includes(criteria.requiredTag)) return false;
  if (criteria.includeUnsafe !== undefined && criteria.includeUnsafe === false && !plan.isSafe) return false;
  return true;
};

const inRange = (value: string, from?: string, to?: string): boolean => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  if (from && timestamp < new Date(from).getTime()) return false;
  if (to && timestamp > new Date(to).getTime()) return false;
  return true;
};

const normalizeLimit = (limit?: number): number => {
  if (limit === undefined) return 50;
  if (limit <= 0) return 1;
  if (limit > 500) return 500;
  return Math.floor(limit);
};

export const listPlans = async (
  store: InMemoryCockpitStore,
  criteria: PlanListCriteria = {},
): Promise<ReadonlyArray<RecoveryPlan>> => {
  const plans = await store.listPlans();
  if (!plans.ok) {
    return [];
  }
  return plans.value.filter((plan) => matchesPlan(plan, criteria));
};

export const listRuns = async (
  store: InMemoryCockpitStore,
  query: RunHistoryQuery,
): Promise<ReadonlyArray<RuntimeRun>> => {
  const runs = await store.listRuns(query.planId);
  if (!runs.ok) {
    return [];
  }

  return runs.value
    .filter((run) => {
      if (query.includeActive === false && (run.state === 'active' || run.state === 'queued')) {
        return false;
      }
      if (query.states && query.states.length > 0 && !query.states.includes(run.state)) {
        return false;
      }
      if (query.from || query.to) {
        return inRange(run.startedAt, query.from, query.to);
      }
      return true;
    })
    .slice(0, normalizeLimit(query.limit));
};

export const listEvents = async (
  store: InMemoryCockpitStore,
  query: EventQuery,
): Promise<ReadonlyArray<CommandEvent>> => {
  const events = await store.getEvents(query.planId, normalizeLimit(query.limit));
  if (query.onlyRecent) {
    const half = Math.max(1, Math.floor(events.length / 2));
    return events.slice(-half);
  }

  if (query.status === undefined) {
    return events;
  }

  return events.filter((event) => event.status === query.status);
};

export const countRuns = async (
  store: InMemoryCockpitStore,
  query: RunHistoryQuery,
): Promise<number> => {
  const runs = await listRuns(store, query);
  return runs.length;
};

export const lastRunByState = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
  state: RuntimeRun['state'],
): Promise<RuntimeRun | undefined> => {
  const runs = await listRuns(store, { planId, states: [state], includeActive: true, limit: 1 });
  return runs.at(-1);
};
