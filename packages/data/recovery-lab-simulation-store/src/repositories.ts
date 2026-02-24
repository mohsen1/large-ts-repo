import type {
  LabExecution,
  LabExecutionResult,
  LabPlanTemplate,
  LabScenario,
  LabTelemetry,
} from '@domain/recovery-simulation-lab-core';
import { asStoreId, type RecoveryLabStore, type StoreFilters, type StoreRecord } from './types';
import type { Result } from '@shared/result';
import { asLabTenantId, asLabRunId } from '@shared/recovery-lab-kernel';
import type { StoreSnapshot } from './types';

class MemoryStore<T> {
  readonly #records = new Map<string, StoreRecord<T>>();
  constructor(private readonly namespace: string) {}

  public async set(id: string, tenant: string, value: T): Promise<StoreRecord<T>> {
    const record: StoreRecord<T> = {
      id,
      tenant: asLabTenantId(tenant),
      value,
      updatedAt: Date.now(),
      snapshot: `${this.namespace}:${id}`,
    };
    this.#records.set(record.id, record);
    return record;
  }

  public async get(id: string): Promise<StoreRecord<T> | null> {
    return this.#records.get(id) ?? null;
  }

  public async list(tenant: string, query?: string): Promise<readonly StoreRecord<T>[]> {
    const values = [...this.#records.values()].filter((entry) => entry.tenant === asLabTenantId(tenant));
    if (!query) {
      return values;
    }
    return values.filter((entry) => entry.snapshot.includes(query));
  }
}

class ScenarioRepositoryImpl implements Omit<RecoveryLabStore['scenarios'], 'toJson'> {
  public constructor(private readonly storage: MemoryStore<LabScenario>) {}

  public async saveScenario(scenario: LabScenario): Promise<void> {
    const id = asStoreId(`${scenario.tenant}`, `${scenario.scenarioId}`);
    await this.storage.set(id, scenario.tenant, scenario);
  }

  public async loadScenario(tenant: string, scenarioId: string): Promise<LabScenario | null> {
    const id = asStoreId(tenant, scenarioId);
    return (await this.storage.get(id))?.value ?? null;
  }

  public async listScenarios(tenant: string): Promise<readonly LabScenario[]> {
    const records = await this.storage.list(tenant);
    return records.map((entry) => entry.value);
  }
}

class PlanRepositoryImpl implements Omit<RecoveryLabStore['plans'], 'toJson'> {
  public constructor(private readonly storage: MemoryStore<LabPlanTemplate>) {}

  public async savePlan(plan: LabPlanTemplate): Promise<void> {
    const id = asStoreId(plan.tenant, plan.scenarioId);
    await this.storage.set(id, plan.tenant, plan);
  }

  public async getPlan(tenant: string, scenarioId: string): Promise<LabPlanTemplate | null> {
    const id = asStoreId(tenant, scenarioId);
    return (await this.storage.get(id))?.value ?? null;
  }

  public async listPlans(tenant: string): Promise<readonly LabPlanTemplate[]> {
    const records = await this.storage.list(tenant);
    return records.map((entry) => entry.value);
  }
}

class RunRepositoryImpl implements Omit<RecoveryLabStore['runs'], 'toJson'> {
  public constructor(private readonly storage: MemoryStore<LabExecution>) {}

  public async appendRun(run: LabExecution): Promise<void> {
    const id = asStoreId(`${run.tenant}`, run.executionId);
    await this.storage.set(id, run.tenant, run);
  }

  public async getRun(tenant: string, executionId: string): Promise<LabExecution | null> {
    const id = asStoreId(tenant, asLabRunId(executionId));
    return (await this.storage.get(id))?.value ?? null;
  }

  public async listRuns(tenant: string): Promise<readonly LabExecution[]> {
    const records = await this.storage.list(tenant);
    return records.map((entry) => entry.value);
  }
}

class ResultRepositoryImpl implements Omit<RecoveryLabStore['results'], 'toJson'> {
  public constructor(private readonly storage: MemoryStore<LabExecutionResult>) {}

  public async saveResult(result: LabExecutionResult): Promise<void> {
    const id = asStoreId(`${result.context.tenant}`, `${result.execution.executionId}`);
    await this.storage.set(id, result.context.tenant, result);
  }

  public async getResult(tenant: string, executionId: string): Promise<LabExecutionResult | null> {
    const id = asStoreId(tenant, asLabRunId(executionId));
    return (await this.storage.get(id))?.value ?? null;
  }

  public async listResults(tenant: string): Promise<readonly LabExecutionResult[]> {
    const records = await this.storage.list(tenant);
    return records.map((entry) => entry.value);
  }
}

class TelemetryRepositoryImpl implements Omit<RecoveryLabStore['telemetry'], 'toJson'> {
  public constructor(private readonly storage: MemoryStore<LabTelemetry>) {}

  public async saveTelemetry(telemetry: LabTelemetry): Promise<void> {
    const id = asStoreId(telemetry.tenant, telemetry.runId);
    await this.storage.set(id, telemetry.tenant, telemetry);
  }

  public async queryTelemetry(tenant: string): Promise<readonly LabTelemetry[]> {
    const records = await this.storage.list(tenant);
    return records.map((entry) => entry.value);
  }
}

export class MemoryRecoveryLabStore implements RecoveryLabStore {
  readonly #scenarios: ScenarioRepositoryImpl;
  readonly #plans: PlanRepositoryImpl;
  readonly #runs: RunRepositoryImpl;
  readonly #results: ResultRepositoryImpl;
  readonly #telemetry: TelemetryRepositoryImpl;

  public constructor(
    _result?: Result<{}, {}>,
  ) {
    const scenarioStore = new MemoryStore<LabScenario>('scenarios');
    const planStore = new MemoryStore<LabPlanTemplate>('plans');
    const runStore = new MemoryStore<LabExecution>('runs');
    const resultStore = new MemoryStore<LabExecutionResult>('results');
    const telemetryStore = new MemoryStore<LabTelemetry>('telemetry');

    this.#scenarios = new ScenarioRepositoryImpl(scenarioStore);
    this.#plans = new PlanRepositoryImpl(planStore);
    this.#runs = new RunRepositoryImpl(runStore);
    this.#results = new ResultRepositoryImpl(resultStore);
    this.#telemetry = new TelemetryRepositoryImpl(telemetryStore);
  }

  public get scenarios(): RecoveryLabStore['scenarios'] {
    return this.#scenarios;
  }

  public get plans(): RecoveryLabStore['plans'] {
    return this.#plans;
  }

  public get runs(): RecoveryLabStore['runs'] {
    return this.#runs;
  }

  public get results(): RecoveryLabStore['results'] {
    return this.#results;
  }

  public get telemetry(): RecoveryLabStore['telemetry'] {
    return this.#telemetry;
  }

  public async queryStore(filters: StoreFilters): Promise<StoreSnapshot> {
    const [scenarios, plans, runs] = await Promise.all([
      this.#scenarios.listScenarios(filters.tenant),
      this.#plans.listPlans(filters.tenant),
      this.#runs.listRuns(filters.tenant),
    ]);

    return {
      tenant: asLabTenantId(filters.tenant),
      scenarios,
      plans,
      runIds: runs.map((run) => run.executionId),
    };
  }
}
