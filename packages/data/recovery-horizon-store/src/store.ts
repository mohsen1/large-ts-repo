import { type Result, err, ok } from '@shared/result';
import type {
  HorizonStoreRecord,
  HorizonReadResult,
  HorizonWriteArgs,
  HorizonLookupConfig,
  HorizonHistoryWindow,
  HorizonSignalEnvelope,
  HorizonPlan,
} from './types.js';
import { bootstrapPayloads } from './seed.js';
import type {
  HorizonSignal,
  HorizonInput,
  PluginStage,
  RunId,
  PlanId,
  TimeMs,
  JsonLike,
} from '@domain/recovery-horizon-engine';
import { parseHorizonInput, parseHorizonSignal, parseHorizonPlan } from '@domain/recovery-horizon-engine';

const nowMs = (): TimeMs => Date.now() as TimeMs;
const toPlanId = (value: string): PlanId => value as PlanId;
const toRunId = (value: string): RunId => value as RunId;

type MutationKind = 'create' | 'update' | 'delete' | 'archive';
type StoreMutation = {
  readonly kind: MutationKind;
  readonly at: TimeMs;
  readonly runId: RunId;
};

type StoreRow = {
  record: HorizonStoreRecord;
  mutationLog: StoreMutation[];
};

const parseSeedInput = (seed: HorizonSignal<PluginStage, JsonLike>): HorizonSignal<PluginStage, JsonLike> =>
  parseHorizonSignal(seed);

const seededRecords: readonly StoreRow[] = bootstrapPayloads.map((seed) => {
  const signal = parseSeedInput(seed);
  return {
    record: {
      id: toPlanId(signal.id),
      tenantId: signal.input.tenantId,
      runId: toRunId(signal.input.runId),
      updatedAt: nowMs(),
      signal,
      plan: parseHorizonPlan({
        id: signal.id,
        tenantId: signal.input.tenantId,
        startedAt: nowMs(),
        pluginSpan: {
          stage: signal.kind,
          label: `${signal.kind.toUpperCase()}_STAGE`,
          startedAt: nowMs(),
        },
      }),
    },
    mutationLog: [{ kind: 'create', at: nowMs(), runId: toRunId(signal.input.runId) }],
  };
});

const toLookupFilter = (config: HorizonLookupConfig) =>
  (entry: StoreRow) =>
    entry.record.tenantId === config.tenantId
    && (config.includeArchived ? true : entry.record.signal.severity !== 'critical')
    && (!config.stages || config.stages.includes(entry.record.signal.kind))
    && true;

export class RecoveryHorizonStore {
  #data = new Map<string, StoreRow>();

  constructor(
    initial: readonly HorizonSignal<PluginStage, JsonLike>[] = [],
  ) {
    for (const signal of initial) {
      this.upsert(signal);
    }
    for (const row of seededRecords) {
      this.#data.set(row.record.id, row);
    }
  }

  upsert(input: HorizonSignal<PluginStage, JsonLike>): Result<HorizonStoreRecord> {
    try {
      const runId = toRunId(input.input.runId);
      const planId = toPlanId(input.id);
      const signal = parseHorizonSignal(input);
      parseHorizonInput(signal.input as HorizonInput<PluginStage>);

      const record: HorizonStoreRecord = {
        id: planId,
        tenantId: signal.input.tenantId,
        runId,
        updatedAt: nowMs(),
        signal,
      };

      const history: StoreMutation = {
        kind: this.#data.has(planId) ? 'update' : 'create',
        at: record.updatedAt,
        runId,
      };

      const previous = this.#data.get(planId);
      const mutationLog = previous ? [...previous.mutationLog, history] : [history];

      this.#data.set(planId, {
        record,
        mutationLog,
      });

      return ok(record);
    } catch (error) {
      return err(error as Error);
    }
  }

  delete(planId: PlanId): Result<void> {
    const removed = this.#data.get(planId);
    if (!removed) {
      return err(new Error(`missing plan ${planId}`));
    }
    const archived: StoreRow = {
      ...removed,
      mutationLog: [...removed.mutationLog, { kind: 'delete', at: nowMs(), runId: removed.record.runId }],
    };
    this.#data.set(planId, archived);
    return ok(undefined);
  }

  async list(config: HorizonLookupConfig): Promise<Result<HorizonReadResult>> {
    const rows = [...this.#data.values()].filter(toLookupFilter(config));
    const filtered = rows.slice(0, config.maxRows ?? 250);

    return ok({
      items: filtered.map((entry) => entry.record),
      total: rows.length,
      cursor: filtered.length ? `cursor:${filtered.length}` : undefined,
    });
  }

  async *stream(config: HorizonLookupConfig): AsyncGenerator<HorizonSignal<PluginStage, JsonLike>> {
    const rows = [...this.#data.values()].filter(toLookupFilter(config));
    for (const row of rows) {
      await Promise.resolve();
      yield row.record.signal;
    }
  }

  async history(config: HorizonLookupConfig): Promise<Result<HorizonHistoryWindow>> {
    const rows = [...this.#data.values()].filter(toLookupFilter(config));
    const events = rows.flatMap((entry) =>
      entry.mutationLog.map((log) => ({
        kind: log.kind === 'archive' ? 'archive' : log.kind === 'delete' ? 'delete' : 'upsert',
        tenantId: entry.record.tenantId,
        planId: entry.record.id,
        runId: entry.record.runId,
        at: log.at,
      } satisfies HorizonHistoryWindow['events'][number])),
    );

    if (!events.length) {
      const now = nowMs();
      return ok({
        minTime: now,
        maxTime: now,
        events: [],
      });
    }

    return ok({
      minTime: events[0].at,
      maxTime: events[events.length - 1].at,
      events,
    });
  }

  snapshot(config: HorizonLookupConfig): HorizonSignalEnvelope {
    const rows = [...this.#data.values()].filter((entry) => entry.record.tenantId === config.tenantId);
    const signal = rows[0]?.record.signal;
    if (!signal) {
      throw new Error(`no signal for ${config.tenantId}`);
    }

    return {
      payload: signal,
      context: {
        runId: signal.input.runId,
        pluginKind: signal.kind,
        tenantId: config.tenantId,
      },
    };
  }

  applyBulk(args: readonly HorizonWriteArgs[]): Promise<Result<number>> {
    let count = 0;
    for (const arg of args) {
      const result = this.upsert(arg.signal);
      if (result.ok) {
        count += 1;
      }
    }
    return Promise.resolve(ok(count));
  }

  static fromSeed(): RecoveryHorizonStore {
    return new RecoveryHorizonStore(seededRecords.map((entry) => entry.record.signal));
  }
}

export const seedStore = (): RecoveryHorizonStore => RecoveryHorizonStore.fromSeed();
