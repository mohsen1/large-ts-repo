import { combine, fail, ok, type Result } from '@shared/result';
import {
  asChronicleGraphEdgeId,
  asChronicleGraphNodeId,
  asChronicleGraphPlanId,
  asChronicleGraphRoute,
  asChronicleGraphRunId,
  asChronicleGraphTenantId,
  type ChronicleGraphObservation,
  type ChronicleGraphPlanId,
  type ChronicleGraphRunId,
  type ChronicleGraphRoute,
  type ChronicleGraphScenario,
  type ChronicleGraphContext,
  type ChronicleGraphBlueprint,
} from '@domain/recovery-chronicle-graph-core';
import {
  type ChronicleGraphEventRecord,
  type ChronicleGraphRecordSet,
  ChronicleGraphRunRecord,
  createSeedRecordSet,
  parseEventRecord,
} from './records.js';

export interface ChronicleGraphStorePolicy {
  readonly ttlMs: number;
  readonly maxRunsPerTenant: number;
  readonly maxEventsPerRun: number;
}

export const defaultGraphStorePolicy: ChronicleGraphStorePolicy = {
  ttlMs: 120_000,
  maxRunsPerTenant: 40,
  maxEventsPerRun: 500,
};

export interface ChronicleGraphSnapshot {
  readonly tenant: string;
  readonly route: ChronicleGraphRoute;
  readonly runId: ChronicleGraphRunId;
  readonly status: 'ok' | 'partial' | 'failed';
  readonly startedAt: number;
  readonly score: number;
}

const withExpireCheck = (value: number, ttl: number): boolean => Date.now() - value > ttl;

export class ChronicleGraphRepository {
  readonly #runs = new Map<ChronicleGraphRunId, ChronicleGraphRecordSet>();
  readonly #scenarioRuns = new Map<ChronicleGraphPlanId, ChronicleGraphRunId[]>();
  readonly #policy: ChronicleGraphStorePolicy;

  public constructor(policy: ChronicleGraphStorePolicy = defaultGraphStorePolicy) {
    this.#policy = policy;
  }

  public async ensureRun(recordSet: ChronicleGraphRecordSet): Promise<Result<ChronicleGraphRunId>> {
    const [runId] = recordSet.runs.at(0) ? [recordSet.runs[0].runId] : [undefined];
    if (!runId) return fail(new Error('missing run id'), 'invalid-record');

    this.#runs.set(runId, {
      ...recordSet,
      events: [...recordSet.events],
      runs: [...recordSet.runs],
    });
    const existing = this.#scenarioRuns.get(recordSet.scenario) ?? [];
    const bucket = [...existing, runId].toSorted((left, right) => left.localeCompare(right));
    this.#scenarioRuns.set(recordSet.scenario, bucket.slice(-this.#policy.maxRunsPerTenant));
    return ok(runId);
  }

  public ingest(recordSet: ChronicleGraphRecordSet): void {
    const runId = recordSet.runs.at(-1)?.runId;
    if (!runId) return;

    this.#runs.set(runId, {
      ...recordSet,
      events: [...recordSet.events],
      runs: [...recordSet.runs],
    });

    const existing = this.#scenarioRuns.get(recordSet.scenario) ?? [];
    this.#scenarioRuns.set(recordSet.scenario, [...existing, runId]);
  }

  public async seed(
    scenario: ChronicleGraphScenario,
    route: ChronicleGraphRoute,
  ): Promise<Result<ChronicleGraphRunId>> {
    const recordSet = createSeedRecordSet(scenario, route);
    return this.ensureRun(recordSet);
  }

  public async writeEvent(
    runId: ChronicleGraphRunId,
    event: ChronicleGraphObservation<unknown>,
  ): Promise<Result<ChronicleGraphEventRecord>> {
    const current = this.#runs.get(runId);
    if (!current) return fail(new Error(`run ${runId} missing`), 'missing');

    const next = {
      runId,
      scenario: current.scenario,
      tenant: current.context.tenant,
      route: current.context.route,
      nodeId: event.nodeId,
      event,
      createdAt: event.timestamp,
    } as ChronicleGraphEventRecord;

    current.events.push(next);
    if (current.events.length > this.#policy.maxEventsPerRun) {
      current.events.splice(0, current.events.length - this.#policy.maxEventsPerRun);
    }

    return ok(next);
  }

  public async finalizeRun(
    runId: ChronicleGraphRunId,
    status: ChronicleGraphRunRecord['status'],
    score: number,
  ): Promise<Result<void>> {
    const current = this.#runs.get(runId);
    if (!current) return fail(new Error(`run ${runId} missing`), 'missing');

    const latest = current.runs.at(-1);
    if (!latest) return fail(new Error(`run ${runId} has no run row`), 'invalid-run');

    const finished: ChronicleGraphRunRecord = {
      ...latest,
      status,
      finishedAt: Date.now(),
      score,
    };
    current.runs[current.runs.length - 1] = finished;

    return ok(undefined);
  }

  public async listByTenant(tenant: string): Promise<readonly ChronicleGraphRecordSet[]> {
    return [...this.#runs.values()].filter((record) => record.context.tenant === tenant);
  }

  public async listByRoute(route: ChronicleGraphRoute): Promise<readonly ChronicleGraphRecordSet[]> {
    return [...this.#runs.values()].filter((record) => record.context.route === route);
  }

  public async listByScenario(scenario: ChronicleGraphPlanId): Promise<readonly ChronicleGraphRecordSet[]> {
    const runIds = this.#scenarioRuns.get(scenario) ?? [];
    return runIds
      .map((runId) => this.#runs.get(runId))
      .filter((record): record is ChronicleGraphRecordSet => record !== undefined);
  }

  public async get(runId: ChronicleGraphRunId): Promise<ChronicleGraphRecordSet | undefined> {
    return this.#runs.get(runId);
  }

  public async events(runId: ChronicleGraphRunId): Promise<readonly ChronicleGraphEventRecord[]> {
    const current = this.#runs.get(runId);
    return current ? [...current.events].toSorted((left, right) => left.createdAt - right.createdAt) : [];
  }

  public async recentByTenant(tenant: string): Promise<readonly ChronicleGraphEventRecord[]> {
    const records = await this.listByTenant(tenant);
    return records.flatMap((record) => record.events);
  }

  public summary(): {
    readonly tenantCount: number;
    readonly runCount: number;
    readonly routeCount: number;
  } {
    const values = [...this.#runs.values()];
    return {
      tenantCount: new Set(values.map((record) => record.context.tenant)).size,
      runCount: values.length,
      routeCount: new Set(values.map((record) => record.context.route)).size,
    };
  }

  public async prune(): Promise<Result<number>> {
    const stale = [...this.#runs.entries()].filter(([, record]) => {
      const lastRun = record.runs.at(-1);
      const startedAt = lastRun?.startedAt ?? 0;
      return withExpireCheck(startedAt, this.#policy.ttlMs);
    });

    for (const [runId] of stale) {
      this.#runs.delete(runId);
    }

    return ok(stale.length);
  }

  public clear(): void {
    this.#runs.clear();
    this.#scenarioRuns.clear();
  }

  public byBlueprint(blueprint: ChronicleGraphBlueprint): ChronicleGraphRecordSet[] {
    const candidates = [...this.#runs.values()].filter((record) => record.blueprint.id === blueprint.id);
    return candidates;
  }

  public lookup(runId: ChronicleGraphRunId): ChronicleGraphRecordSet | undefined {
    return this.#runs.get(runId);
  }
}

export const createRepository = (policy?: ChronicleGraphStorePolicy): ChronicleGraphRepository =>
  new ChronicleGraphRepository(policy);

export const hydrate = (rows: readonly unknown[]): ChronicleGraphRepository => {
  const repository = new ChronicleGraphRepository();
  for (const row of rows) {
    const parsed = parseEventRecord(row);
    if (!parsed) continue;

    const scenario = asChronicleGraphPlanId(parsed.scenario);
    const existing = repository.lookup(parsed.runId);
    if (!existing) {
      const tenant = asChronicleGraphTenantId(parsed.tenant);
      const route = asChronicleGraphRoute(parsed.route);
      repository.ingest({
        scenario,
        context: {
          tenant,
          runId: parsed.runId,
          planId: scenario,
          route,
          timeline: [route, asChronicleGraphNodeId('seed'), 'lane:control'],
          status: parsed.event.status,
          state: parsed.event.payload as Record<string, unknown>,
        },
        blueprint: {
          id: scenario,
          tenant,
          route,
          title: 'hydrated',
          description: 'hydrated recordset',
          nodes: [
            {
              id: asChronicleGraphNodeId('seed'),
              name: 'seed',
              lane: 'lane:control',
              dependsOn: [],
              labels: { hydrated: true },
            },
          ],
          edges: [],
        },
        events: [parsed],
        runs: [
          {
            runId: parsed.runId,
            scenario,
            tenant: parsed.tenant,
            route,
            status: 'partial',
            startedAt: parsed.createdAt,
            score: 0,
          },
        ],
      });
      continue;
    }

    void existing.events.push(parsed);
  }
  return repository;
};

export const mergeRecordRuns = (
  left: ChronicleGraphRecordSet,
  right: ChronicleGraphRecordSet,
): ChronicleGraphRecordSet =>
  ({
    ...left,
    events: [...left.events, ...right.events],
    runs: [...left.runs, ...right.runs],
  });
