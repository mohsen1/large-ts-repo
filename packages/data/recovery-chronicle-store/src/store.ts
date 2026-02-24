import { asChronicleRoute, asChronicleTenantId, makePlanId, makeRunId } from '@domain/recovery-chronicle-core';
import { combine, fail, ok, type Result } from '@shared/result';
import type {
  ChronicleContext,
  ChronicleId,
  ChronicleObservation,
  ChroniclePhase,
  ChroniclePlanId,
  ChronicleRunId,
  ChronicleRoute,
  ChronicleScenario,
  ChronicleStatus,
  ChronicleTenantId,
} from '@domain/recovery-chronicle-core';
import type { ChronicleEnvelopeRecord, ChronicleSnapshotRecord } from './entities.js';
import { seededScenario } from './entities.js';

interface RawStoreRow {
  readonly record: ChronicleEnvelopeRecord;
  readonly receivedAt: number;
}

export interface ChronicleStoreSummary {
  readonly totalRows: number;
  readonly tenants: readonly ChronicleTenantId[];
  readonly runCount: number;
}

export interface ChronicleStorePolicy {
  readonly defaultTtlMs: number;
  readonly includeHistorical: boolean;
  readonly maxByTenant: number;
}

export const defaultChronicleStorePolicy: ChronicleStorePolicy = {
  defaultTtlMs: 120_000,
  includeHistorical: true,
  maxByTenant: 40,
};

const compareNumber = <T>(values: readonly T[], compare: (left: T, right: T) => number): T[] =>
  [...values].sort(compare);

export class ChronicleRepository {
  readonly #rows = new Map<ChronicleId, RawStoreRow>();
  readonly #events: ChronicleObservation[] = [];
  readonly #policy: ChronicleStorePolicy;

  public constructor(policy: ChronicleStorePolicy = defaultChronicleStorePolicy) {
    this.#policy = policy;
  }

  public async save(record: ChronicleEnvelopeRecord): Promise<Result<ChronicleId>> {
    this.#rows.set(record.id, { record, receivedAt: Date.now() });
    this.#events.push(record.payload);

    if (this.#events.length > this.#policy.maxByTenant * 8) {
      const ordered = compareNumber(
        [...this.#rows.entries()],
        (left, right) => left[1].receivedAt - right[1].receivedAt,
      );
      for (const [staleId] of ordered.slice(0, ordered.length - this.#policy.maxByTenant)) {
        this.#rows.delete(staleId);
      }
    }

    return ok(record.id);
  }

  public async saveBatch(records: readonly ChronicleEnvelopeRecord[]): Promise<Result<readonly ChronicleId[]>> {
    const writes = await Promise.all(records.map((record) => this.save(record)));
    const failures = writes.filter((write) => !write.ok);
    if (failures.length > 0) {
      const firstFailure = failures[0];
      return fail(firstFailure.error, firstFailure.code);
    }
    const values = writes.filter((write): write is { ok: true; value: ChronicleId } => write.ok).map((write) => write.value);
    return ok(values);
  }

  public async get(id: ChronicleId): Promise<ChronicleEnvelopeRecord | undefined> {
    return this.#rows.get(id)?.record;
  }

  public async listByRoute(route: ChronicleRoute): Promise<readonly ChronicleEnvelopeRecord[]> {
    const filtered = [...this.#rows.values()].filter((row) => row.record.route === route);
    return compareNumber(filtered, (left, right) => left.receivedAt - right.receivedAt).map((row) => row.record);
  }

  public async listByTenant(tenant: ChronicleTenantId): Promise<readonly ChronicleEnvelopeRecord[]> {
    const filtered = [...this.#rows.values()].filter((row) => row.record.tenant === tenant);
    return compareNumber(filtered, (left, right) => right.receivedAt - left.receivedAt).map((row) => row.record);
  }

  public async snapshot(planId: ChroniclePlanId): Promise<ChronicleSnapshotRecord | undefined> {
    const rows = [...this.#rows.values()].filter((row) => row.record.scenarioId === planId);
    const latest = compareNumber(rows, (left, right) => right.receivedAt - left.receivedAt)[0];
    if (!latest) return undefined;

    return {
      id: latest.record.scenarioId,
      blueprint: {
        ...seededScenario.manifest,
        plan: latest.record.scenarioId,
      },
      latestRun: latest.record.runId,
      totalEvents: rows.length,
      updatedAt: latest.receivedAt,
    };
  }

  public async queryByPlan(planId: ChroniclePlanId): Promise<readonly ChronicleEnvelopeRecord[]> {
    return [...this.#rows.values()].filter((row) => row.record.scenarioId === planId).map((row) => row.record);
  }

  public async *streamByTenant(tenant: ChronicleTenantId): AsyncGenerator<ChronicleEnvelopeRecord> {
    for (const row of compareNumber([...this.#rows.values()], (left, right) => right.receivedAt - left.receivedAt)) {
      if (row.record.tenant === tenant) yield row.record;
    }
  }

  public async *streamByRun(runId: ChronicleRunId): AsyncGenerator<ChronicleEnvelopeRecord> {
    for (const row of this.#rows.values()) {
      if (row.record.runId === runId) yield row.record;
    }
  }

  public async collectPhases(tenant: ChronicleTenantId): Promise<readonly ChroniclePhase[]> {
    const rows = await this.listByTenant(tenant);
    return [...new Set(rows.map((row) => row.payload.phase))];
  }

  public async summary(): Promise<ChronicleStoreSummary> {
    const tenantValues = [...this.#rows.values()].map((row) => row.record.tenant);
    return {
      totalRows: this.#rows.size,
      tenants: [...new Set(tenantValues)],
      runCount: this.#events.length,
    };
  }

  public clear(): void {
    this.#rows.clear();
    this.#events.length = 0;
  }

  public policy(): ChronicleStorePolicy {
    return this.#policy;
  }
}

export class ChronicleInMemoryAdapter {
  readonly #repository: ChronicleRepository;

  public constructor(repository: ChronicleRepository = new ChronicleRepository()) {
    this.#repository = repository;
  }

  public async writeScenarioRun(
    scenario: ChronicleScenario,
    records: readonly ChronicleObservation[],
  ): Promise<Result<number>> {
    const prepared = records.map((record, index) => ({
      id: `${scenario.id}:${record.id}:${index}` as ChronicleId,
      scenarioId: scenario.id,
      runId: makeRunId(scenario.id),
      tenant: scenario.tenant,
      route: scenario.route,
      payload: record,
      createdAt: record.timestamp,
    }));

    const saved = await this.#repository.saveBatch(prepared);
    if (!saved.ok) return fail(saved.error, saved.code);
    return ok(saved.value.length);
  }

  public get repository(): ChronicleRepository {
    return this.#repository;
  }
}

export const createPlanIdFromInput = (tenant: ChronicleTenantId | string, route: ChronicleRoute | string): ChroniclePlanId =>
  makePlanId(asChronicleTenantId(tenant), asChronicleRoute(route));
