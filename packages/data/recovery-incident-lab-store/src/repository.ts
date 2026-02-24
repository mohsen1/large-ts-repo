import type {
  IncidentLabScenario,
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabEnvelope,
  IncidentLabSignal,
} from '@domain/recovery-incident-lab-core';
import type { LabStoreError, LabStoreResult, Paginated, SnapshotFilter, StoreQueryOptions } from './types';

export interface RecoveryIncidentLabRepository {
  saveScenario(scenario: IncidentLabScenario): Promise<LabStoreResult<void>>;
  savePlan(plan: IncidentLabPlan): Promise<LabStoreResult<void>>;
  saveRun(run: IncidentLabRun): Promise<LabStoreResult<void>>;
  appendEnvelope(envelope: IncidentLabEnvelope): Promise<LabStoreResult<void>>;
  appendSignal(signal: IncidentLabSignal): Promise<LabStoreResult<void>>;
  loadScenario(scenarioId: string): Promise<LabStoreResult<IncidentLabScenario>>;
  listScenarios(filter?: SnapshotFilter): Promise<Paginated<IncidentLabScenario>>;
  listPlansByScenario(scenarioId: string): Promise<Paginated<IncidentLabPlan>>;
  listRuns(filter?: SnapshotFilter): Promise<Paginated<IncidentLabRun>>;
  loadLatestRunByScenario(scenarioId: string): Promise<LabStoreResult<IncidentLabRun>>;
}

const ok = <T>(value: T): LabStoreResult<T> => ({ ok: true, value });
const err = <T>(error: LabStoreError): LabStoreResult<T> => ({ ok: false, error });

const buildPaginated = <T>(items: readonly T[], options?: StoreQueryOptions): { readonly items: readonly T[]; readonly total: number; readonly nextOffset?: string } => {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? items.length;
  const sliced = items.slice(offset, offset + limit);
  const hasNext = offset + limit < items.length;
  return {
    items: sliced,
    total: items.length,
    ...(hasNext ? { nextOffset: String(offset + limit) } : {}),
  };
};

const fail: LabStoreError = { code: 'not_found', message: 'not_found' };

export class InMemoryRecoveryIncidentLabRepository implements RecoveryIncidentLabRepository {
  private scenarios = new Map<string, IncidentLabScenario>();
  private plans = new Map<string, IncidentLabPlan[]>();
  private runs = new Map<string, IncidentLabRun[]>();
  private envelopes = new Map<string, IncidentLabEnvelope[]>();
  private signals = new Map<string, IncidentLabSignal[]>();

  async saveScenario(scenario: IncidentLabScenario): Promise<LabStoreResult<void>> {
    this.scenarios.set(scenario.id, scenario);
    return ok(undefined);
  }

  async savePlan(plan: IncidentLabPlan): Promise<LabStoreResult<void>> {
    const existing = this.plans.get(plan.scenarioId) ?? [];
    this.plans.set(plan.scenarioId, [plan, ...existing]);
    return ok(undefined);
  }

  async saveRun(run: IncidentLabRun): Promise<LabStoreResult<void>> {
    const key = run.scenarioId;
    const current = this.runs.get(key) ?? [];
    this.runs.set(key, [run, ...current]);
    return ok(undefined);
  }

  async appendEnvelope(envelope: IncidentLabEnvelope): Promise<LabStoreResult<void>> {
    const bucket = this.envelopes.get(String(envelope.scenarioId)) ?? [];
    this.envelopes.set(String(envelope.scenarioId), [envelope, ...bucket]);
    return ok(undefined);
  }

  async appendSignal(signal: IncidentLabSignal): Promise<LabStoreResult<void>> {
    const key = signal.node;
    const current = this.signals.get(key) ?? [];
    this.signals.set(key, [signal, ...current]);
    return ok(undefined);
  }

  async loadScenario(scenarioId: string): Promise<LabStoreResult<IncidentLabScenario>> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      return err({ ...fail, message: `scenario not found: ${scenarioId}` });
    }
    return ok(scenario);
  }

  async listScenarios(filter: SnapshotFilter = {}): Promise<Paginated<IncidentLabScenario>> {
    const items = [...this.scenarios.values()];
    const filtered = filter.scenarioId
      ? items.filter((scenario) => scenario.id === filter.scenarioId)
      : items;
    return buildPaginated(filtered, { limit: filtered.length, offset: 0 });
  }

  async listPlansByScenario(scenarioId: string): Promise<Paginated<IncidentLabPlan>> {
    return buildPaginated(this.plans.get(scenarioId) ?? [], { limit: 20, offset: 0 });
  }

  async listRuns(filter: SnapshotFilter = {}): Promise<Paginated<IncidentLabRun>> {
    const all = [...this.runs.values()].flatMap((runs) => runs);
    const filtered = filter.scenarioId ? all.filter((run) => run.scenarioId === filter.scenarioId) : all;
    return buildPaginated(filtered, { limit: filtered.length, offset: 0 });
  }

  async loadLatestRunByScenario(scenarioId: string): Promise<LabStoreResult<IncidentLabRun>> {
    const run = (this.runs.get(scenarioId) ?? [])[0];
    if (!run) {
      return err({ ...fail, code: 'not_found', message: `run not found for scenario ${scenarioId}` });
    }
    return ok(run);
  }
}
