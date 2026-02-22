import { fail, ok, type Result } from '@shared/result';
import { type FailureSignal, type FailureActionPlan } from '@domain/failure-intelligence';
import { parseQuery, parsePlan, parseSignal } from './validators';
import { querySignals, summarizeQueries, type PlanQueryResult } from './queries';
import { makeRecordFromPlan, type FailureKnowledgeRecord, type SignalEnvelope, type PlanEnvelope, type FailureStoreState } from './records';

export interface FailureIntelligenceRepository {
  ingestSignal(raw: unknown): Promise<Result<FailureSignal, Error>>;
  persistPlan(plan: unknown): Promise<Result<FailureActionPlan, Error>>;
  querySignals(rawQuery: unknown): Promise<Result<FailureSignal[], Error>>;
  queryPlans(rawQuery: unknown): Promise<Result<readonly PlanQueryResult[], Error>>;
  snapshot(): FailureStoreState;
}

export class InMemoryFailureIntelligenceRepository implements FailureIntelligenceRepository {
  private readonly signalStore: SignalEnvelope[] = [];
  private readonly planStore: PlanEnvelope[] = [];
  private readonly knowledgeStore: FailureKnowledgeRecord[] = [];

  async ingestSignal(raw: unknown): Promise<Result<FailureSignal, Error>> {
    const signal = parseSignal(raw);
    if (!signal) return fail(new Error('invalid-failure-signal'));
    this.signalStore.push({ signal, capturedAt: new Date().toISOString() });
    return ok(signal);
  }

  async persistPlan(raw: unknown): Promise<Result<FailureActionPlan, Error>> {
    const parsed = parsePlan(raw);
    if (!parsed) return fail(new Error('invalid-failure-plan'));
    this.planStore.push({ plan: parsed, recordedAt: new Date().toISOString() });
    this.knowledgeStore.push(makeRecordFromPlan(parsed));
    return ok(parsed);
  }

  async querySignals(rawQuery: unknown): Promise<Result<FailureSignal[], Error>> {
    const query = parseQuery(rawQuery);
    if (!query) return fail(new Error('invalid-signal-query'));
    return ok(querySignals(this.signalStore.map((entry) => entry.signal), query));
  }

  async queryPlans(rawQuery: unknown): Promise<Result<readonly PlanQueryResult[], Error>> {
    const query = parseQuery(rawQuery);
    if (!query) return fail(new Error('invalid-plan-query'));

    const now = Date.now();
    const matches: PlanQueryResult[] = this.planStore
      .filter((entry) => entry.plan.tenantId === query.tenantId)
      .map((entry) => {
        const createdAt = Date.parse(entry.recordedAt);
        return {
          plan: entry.plan,
          state: now - createdAt < 60 * 60_000 ? ('active' as const) : ('expired' as const),
          createdAgeMs: now - createdAt,
        };
      })
      .filter((entry) => entry.createdAgeMs <= query.to - query.from)
      .slice(0, query.limit);

    return ok(matches);
  }

  snapshot(): FailureStoreState {
    const plans = this.planStore;
    const signals = this.signalStore;
    const reports = this.knowledgeStore;
    if (plans.length) {
      void summarizeQueries(plans.map((entry) => ({
        plan: entry.plan,
        state: 'active',
        createdAgeMs: Date.now() - Date.parse(entry.recordedAt),
      })));
    }

    return { signals, plans, reports };
  }
}

export const createInMemoryFailureStore = (): FailureIntelligenceRepository => new InMemoryFailureIntelligenceRepository();
