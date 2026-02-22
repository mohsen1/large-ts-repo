import type { Result } from '@shared/result';
import type {
  StrategyStore,
  StrategyStoreRecord,
  StrategyStoreQuery,
  StrategyStoreEvent,
  StrategyStoreMetrics,
  StrategyAuditEntry,
} from './types';
import type { StrategyRun, StrategyRunId } from '@domain/recovery-orchestration-planning';
import { buildRecord } from './records';
import { matchesQuery } from './query';
import { computeMetrics } from './analytics';
import type { StrategyTemplate } from '@domain/recovery-orchestration-planning';

interface InternalState {
  readonly plans: Map<string, StrategyStoreRecord>;
  readonly runs: Map<string, StrategyRun>;
  readonly events: StrategyStoreEvent[];
  readonly audits: StrategyAuditEntry[];
}

const success = <T>(value: T): Result<T, string> => ({ ok: true, value });
const failure = <T>(error: string): Result<T, string> => ({ ok: false, error });

const planKey = (tenantId: string, planId: string) => `${tenantId}::${planId}`;
const runKey = (tenantId: string, runId: string) => `${tenantId}::${runId}`;

export class InMemoryRecoveryStrategyStore implements StrategyStore {
  private readonly state: InternalState;

  constructor() {
    this.state = {
      plans: new Map<string, StrategyStoreRecord>(),
      runs: new Map<string, StrategyRun>(),
      events: [],
      audits: [],
    };
  }

  async upsertPlan(tenantId: string, record: StrategyStoreRecord): Promise<Result<void, string>> {
    if (!tenantId || !record.plan.strategyId) {
      return failure('missing tenant id or strategy id');
    }
    const normalized = buildRecord(record.tenantId, record.plan, record.draft, record.template);
    this.state.plans.set(planKey(tenantId, record.plan.strategyId), normalized);
    this.state.events.push({
      tenantId,
      type: 'plan-created',
      planId: record.plan.strategyId,
      createdAt: new Date().toISOString(),
    });
    return success(undefined);
  }

  async getPlan(tenantId: string, planId: string): Promise<Result<StrategyStoreRecord | null, string>> {
    const record = this.state.plans.get(planKey(tenantId, planId));
    return success(record ?? null);
  }

  async listPlans(query: StrategyStoreQuery): Promise<readonly StrategyStoreRecord[]> {
    const rows = [...this.state.plans.values()].filter((record) => matchesQuery(record, query));
    return [...rows].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async upsertRun(tenantId: string, run: StrategyRun): Promise<Result<void, string>> {
    if (!run.runId) {
      return failure('missing run id');
    }
    this.state.runs.set(runKey(tenantId, String(run.runId)), run);
    this.state.events.push({
      tenantId,
      type: 'run-created',
      planId: run.plan.strategyId,
      createdAt: new Date().toISOString(),
    });
    return success(undefined);
  }

  async appendCommandLog(tenantId: string, planId: string, commandSummary: string): Promise<Result<void, string>> {
    const record = this.state.plans.get(planKey(tenantId, planId));
    if (!record) {
      return failure('unknown plan');
    }

    this.state.audits.push({
      tenantId,
      planId,
      command: commandSummary,
      status: 'ok',
      at: new Date().toISOString(),
    });

    this.state.plans.set(planKey(tenantId, planId), {
      ...record,
      commandLog: [...record.commandLog, commandSummary],
    });

    this.state.events.push({
      tenantId,
      type: 'command-added',
      planId,
      createdAt: new Date().toISOString(),
    });

    return success(undefined);
  }

  async latestCommand(tenantId: string, planId: string): Promise<Result<string | undefined, string>> {
    const event = this.state.audits
      .filter((row) => row.tenantId === tenantId && row.planId === planId)
      .at(-1);
    return success(event?.command);
  }

  async getRun(tenantId: string, runId: StrategyRunId): Promise<Result<StrategyRun | undefined, string>> {
    const row = this.state.runs.get(runKey(tenantId, String(runId)));
    return success(row);
  }

  async templates(tenantId: string): Promise<readonly StrategyTemplate[]> {
    const records = await this.listPlans({ tenantIds: [tenantId], includeCompleted: true });
    return records.map((record) => record.template);
  }

  async events(tenantId: string, limit = 20): Promise<ReadonlyArray<StrategyStoreEvent>> {
    return this.state.events.filter((event) => event.tenantId === tenantId).slice(-Math.max(1, limit));
  }

  async metrics(tenantId: string): Promise<StrategyStoreMetrics> {
    const records = await this.listPlans({ tenantIds: [tenantId], includeCompleted: true });
    return computeMetrics(records);
  }
}

export const createRecoveryStrategyStore = (): StrategyStore => new InMemoryRecoveryStrategyStore();
