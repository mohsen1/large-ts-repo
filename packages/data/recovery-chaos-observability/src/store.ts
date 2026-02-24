import { fail, ok, type Result } from '@shared/result';
import type { EpochMs, StageBoundary } from '@domain/recovery-chaos-lab';
import {
  type ChaosRunEnvelope,
  type ChaosRunIndex,
  type ChaosRunMetadata,
  type ChaosRunMetrics,
  type ChaosRunQuery,
  type ChaosRunUpdate,
  type RunStoreState,
  createStageStatusMap,
  buildMetricBundle,
  projectMetadata,
  type QueryCursor
} from './models';
import { asNamespace, asScenarioId, asRunId } from '@domain/recovery-chaos-lab';
import { filterRows, pickLatestRows } from './query';

export interface RunStoreOptions {
  readonly state?: RunStoreState;
  readonly capacity?: number;
}

type Key = `${string}:${string}:${string}`;

function toKey(namespace: string, scenarioId: string, runId: string): Key {
  return `${namespace}:${scenarioId}:${runId}` as Key;
}

function isAlive(state: RunStoreState, includeArchived: boolean | undefined): boolean {
  if (includeArchived) return true;
  return state === 'active';
}

export interface RunRepository<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  list(query?: ChaosRunQuery<TStages>): Result<readonly ChaosRunEnvelope<TStages>[]>;
  get(runId: string): Result<ChaosRunEnvelope<TStages> | undefined>;
  upsert(envelope: ChaosRunEnvelope<TStages>): Promise<Result<ChaosRunEnvelope<TStages>>>;
  patch(runId: string, update: ChaosRunUpdate<TStages>): Promise<Result<ChaosRunEnvelope<TStages>>>;
  delete(runId: string): Promise<Result<void>>;
  close(): Promise<void>;
  readonly metadata: ChaosRunMetadata;
  index(cursor?: QueryCursor): IterableIterator<ChaosRunIndex>;
  metrics(): ChaosRunMetrics;
}

export class InMemoryRunRepository<TStages extends readonly StageBoundary<string, unknown, unknown>[]> implements RunRepository<TStages> {
  readonly #records = new Map<Key, ChaosRunEnvelope<TStages>>();
  readonly #state: RunStoreState;
  readonly #capacity: number;
  readonly #metadata: ChaosRunMetadata;
  #active = true;

  constructor(
    readonly namespace: string,
    readonly scenarioId: string,
    options: RunStoreOptions = {}
  ) {
    this.#state = options.state ?? 'active';
    this.#capacity = Math.max(options.capacity ?? 128, 1);
    this.#metadata = projectMetadata(namespace, scenarioId);
  }

  list(query: ChaosRunQuery<TStages> = {}): Result<readonly ChaosRunEnvelope<TStages>[]> {
    if (!this.#active) {
      return fail(new Error('repository is closed'));
    }
    const namespace = query.namespace ? String(query.namespace) : undefined;
    const scenarioId = query.scenarioId ? String(query.scenarioId) : undefined;
    const scoped: ChaosRunEnvelope<TStages>[] = [];

    for (const row of this.#records.values()) {
      if (!isAlive(row.state, query.includeArchived)) continue;
      if (namespace && row.namespace !== namespace) continue;
      if (scenarioId && row.scenarioId !== scenarioId) continue;
      scoped.push(row);
    }

    const filtered = filterRows(scoped, {
      ...query,
      namespace: namespace ? namespace : undefined,
      scenarioId: scenarioId ? scenarioId : undefined
    });

    return ok(filtered);
  }

  get(runId: string): Result<ChaosRunEnvelope<TStages> | undefined> {
    if (!this.#active) {
      return fail(new Error('repository is closed'));
    }
    return ok(this.#records.get(toKey(this.namespace, this.scenarioId, runId)));
  }

  async upsert(envelope: ChaosRunEnvelope<TStages>): Promise<Result<ChaosRunEnvelope<TStages>>> {
    if (!this.#active) {
      return fail(new Error('repository is closed'));
    }
    const key = toKey(String(envelope.namespace), String(envelope.scenarioId), String(envelope.runId));
    if (this.#records.size >= this.#capacity) {
      const oldest = [...this.#records.keys()][0];
      if (oldest) {
        this.#records.delete(oldest);
      }
    }
    this.#records.set(key, envelope);
    return ok(envelope);
  }

  async patch(
    runId: string,
    update: ChaosRunUpdate<TStages>
  ): Promise<Result<ChaosRunEnvelope<TStages>>> {
    const key = toKey(this.namespace, this.scenarioId, runId);
    const current = this.#records.get(key);
    if (!current) {
      return fail(new Error(`missing run ${runId}`));
    }
    const next: ChaosRunEnvelope<TStages> = {
      ...current,
      ...update,
      status: update.status ?? current.status,
      progress: update.progress ?? current.progress,
      snapshot: update.snapshot ?? current.snapshot,
      metrics: update.metrics ?? current.metrics,
      statusByStage: update.status
        ? {
            ...createStageStatusMap(current.stages, update.status),
            ...current.statusByStage
          }
        : current.statusByStage
    };
    this.#records.set(key, next);
    return ok(next);
  }

  async delete(runId: string): Promise<Result<void>> {
    this.#records.delete(toKey(this.namespace, this.scenarioId, runId));
    return ok(undefined);
  }

  async close(): Promise<void> {
    this.#records.clear();
    this.#active = false;
  }

  *index(cursor?: QueryCursor): IterableIterator<ChaosRunIndex> {
    const normalizedOffset = Math.max(0, Math.floor(cursor?.offset ?? 0));
    const rows = [...this.#records.values()];
    const selected = pickLatestRows(rows, rows.length || 0);

    for (let index = normalizedOffset; index < selected.length; index += 1) {
      const row = selected[index];
      yield {
        namespace: asNamespace(row.namespace),
        scenarioId: asScenarioId(row.scenarioId),
        runId: asRunId(row.runId),
        seen: Date.now() as EpochMs
      };
    }
  }

  metrics(): ChaosRunMetrics {
    const metricValues = [...this.#records.values()].map((row, index) => {
      const base = row.status === 'failed' ? 0 : 1;
      return Number(row.progress) / 100 * base * Math.max(1, (index + 1) / Math.max(this.#records.size, 1));
    });
    return buildMetricBundle(metricValues);
  }

  get metadata(): ChaosRunMetadata {
    return this.#metadata;
  }
}

export async function withRunStore<
  TStages extends readonly StageBoundary<string, unknown, unknown>[],
  TOut
>(
  namespace: string,
  scenarioId: string,
  callback: (store: InMemoryRunRepository<TStages>) => Promise<TOut>
): Promise<Result<TOut>> {
  const repo = new InMemoryRunRepository<TStages>(namespace, scenarioId);
  try {
    const result = await callback(repo);
    return ok(result);
  } catch (error) {
    return fail(error as Error);
  } finally {
    await repo.close();
  }
}

export function latestRows<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  repo: InMemoryRunRepository<TStages>,
  namespace: string,
  scenarioId: string,
  limit = 10
): Result<readonly ChaosRunEnvelope<TStages>[]> {
  const listed = repo.list({
    namespace: asNamespace(namespace),
    scenarioId: asScenarioId(scenarioId),
    includeArchived: false
  });
  if (!listed.ok) {
    return listed;
  }
  return ok(pickLatestRows(listed.value, limit));
}
