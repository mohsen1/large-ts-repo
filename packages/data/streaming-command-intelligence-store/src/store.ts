import { ok, fail, Result } from '@shared/result';
import type { Repository } from '@data/repositories';
import {
  CommandPlan,
  CommandPlanId,
  CommandRunContext,
  CommandRunResult,
  CommandSignalRecord,
  CommandTenantId,
  CommandEnvelopeId,
  CommandStepId,
  StreamCommandPluginId,
  CommandSignalContext,
  CommandSignalContext as CommandSignalContextTuple,
  CommandSignalEnvelope,
  CommandNamespace,
  CommandTenantId as TenantType,
  CommandTraceId,
} from '@domain/streaming-command-intelligence';
import { asTenantId, StreamHealthSignal, asStreamId } from '@domain/streaming-observability';
import { StreamId } from '@domain/streaming-engine';
import { CommandIntelligenceEvent, CommandIntelligenceRecord, CommandRunCursor } from './types';

type AsyncStackLike = {
  adopt<T>(resource: T, onDispose: (value: T) => Promise<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type AsyncStackCtor = { new (): AsyncStackLike };

const resolveAsyncStack = (): AsyncStackCtor => {
  const Candidate = (globalThis as { AsyncDisposableStack?: AsyncStackCtor }).AsyncDisposableStack;
  if (Candidate) return Candidate;
  return class FallbackAsyncStack implements AsyncStackLike {
    private readonly disposers: Array<() => Promise<void> | void> = [];
    adopt<T>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.disposers.push(() => onDispose(resource));
      return resource;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
        await this.disposers[index]?.();
      }
    }
  };
};

const AsyncStack = resolveAsyncStack();

interface TenantBucket {
  updatedAt: number;
  records: Map<string, CommandIntelligenceRecord>;
}

interface StoreState {
  recordsById: Map<string, CommandIntelligenceRecord>;
  recordsByTenant: Map<string, TenantBucket>;
}

const now = () => new Date().toISOString();
const maxRows = (value?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1_000;
  return Math.min(5_000, Math.max(1, Math.floor(value)));
};

export interface AppendSignalInput {
  readonly traceId: CommandTraceId;
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly namespace: CommandNamespace;
  readonly pluginId: StreamCommandPluginId;
  readonly pluginName: string;
  readonly stepId: CommandStepId;
  readonly payload: Record<string, unknown>;
}

export class InMemoryCommandIntelligenceStore
  implements Repository<CommandPlanId, CommandIntelligenceRecord>, AsyncDisposable
{
  private readonly state: StoreState = {
    recordsById: new Map<string, CommandIntelligenceRecord>(),
    recordsByTenant: new Map<string, TenantBucket>(),
  };
  private disposed = false;

  public constructor(private readonly options: { maxRows?: number } = {}) {}

  public async findById(id: CommandPlanId): Promise<CommandIntelligenceRecord | null> {
    return this.state.recordsById.get(id) ?? null;
  }

  public async save(record: CommandIntelligenceRecord): Promise<void> {
    if (this.disposed) throw new Error('store disposed');
    this.state.recordsById.set(record.runId, record);
    const bucket = this.state.recordsByTenant.get(record.tenantId) ?? { updatedAt: Date.now(), records: new Map<string, CommandIntelligenceRecord>() };
    bucket.records.set(record.runId, record);
    bucket.updatedAt = Date.now();
    this.state.recordsByTenant.set(record.tenantId, bucket);
    this.enforceRetention(record.tenantId);
  }

  public async deleteById(id: CommandPlanId): Promise<void> {
    const record = await this.findById(id);
    if (!record) return;
    this.state.recordsById.delete(id);
    const bucket = this.state.recordsByTenant.get(record.tenantId);
    if (bucket) {
      bucket.records.delete(id);
      if (bucket.records.size === 0) {
        this.state.recordsByTenant.delete(record.tenantId);
      }
    }
  }

  public async all(): Promise<CommandIntelligenceRecord[]> {
    return [...this.state.recordsById.values()];
  }

  public async queryByTenant(tenantId: CommandTenantId): Promise<CommandIntelligenceRecord[]> {
    const bucket = this.state.recordsByTenant.get(tenantId);
    return [...(bucket?.records.values() ?? [])].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  public async listByTenant(tenantId: CommandTenantId): Promise<Result<CommandIntelligenceRecord[]>> {
    try {
      return ok(await this.queryByTenant(tenantId));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('list by tenant failed'));
    }
  }

  public streamByTenant(tenantId: CommandTenantId): AsyncIterable<CommandIntelligenceRecord> {
    const rows = [...(this.state.recordsByTenant.get(tenantId)?.records.values() ?? [])].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
    return {
      async *[Symbol.asyncIterator]() {
        for (const row of rows) {
          yield row;
        }
      },
    };
  }

  public async collectEventsByStream(tenantId: CommandTenantId, streamId: StreamId): Promise<CommandIntelligenceRecord['events']> {
    const rows = await this.queryByTenant(tenantId);
    return rows
      .flatMap((record) => record.events)
      .filter((event) => event.streamId === streamId)
      .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  }

  public async addEvent(runId: CommandPlanId, event: CommandIntelligenceEvent): Promise<Result<void>> {
    const current = await this.findById(runId);
    if (!current) return fail(new Error(`runId not found: ${runId}`));
    await this.save({
      ...current,
      events: [...current.events, event],
      updatedAt: now(),
    });
    return ok(undefined);
  }

  public async appendResults(
    runId: CommandPlanId,
    context: CommandRunContext,
    result: CommandRunResult,
    events: readonly CommandSignalRecord[],
  ): Promise<Result<CommandIntelligenceRecord>> {
    const existing = await this.findById(runId);
    const signalEvents = events.map((event, index) => this.toIntelligenceEvent(runId, result.traceId, event, index));
    const plan: CommandPlan =
      existing?.plan ??
      ({
        planId: runId,
        name: `fallback-plan:${runId}`,
        tenantId: context.tenantId,
        streamId: context.streamId,
        expectedDurationMs: Math.max(1, context.commandCount * 100),
        labels: { source: 'fallback-store' },
        config: { status: context.status },
        plugins: [],
      } satisfies CommandPlan);

    const record: CommandIntelligenceRecord = existing
      ? { ...existing, context, result, events: [...existing.events, ...signalEvents], updatedAt: now() }
      : {
          runId,
          tenantId: context.tenantId,
          streamId: context.streamId,
          context,
          result,
          plan,
          events: signalEvents,
          updatedAt: now(),
        };

    await this.save(record);
    return ok(record);
  }

  public async paginate(cursor: CommandRunCursor): Promise<CommandIntelligenceRecord[]> {
    const rows = await this.queryByTenant(cursor.tenantId);
    const index = cursor.cursor
      ? rows.findIndex((record) => record.updatedAt === cursor.cursor)
      : -1;
    const start = index >= 0 ? index + 1 : 0;
    return rows.slice(start, start + cursor.limit);
  }

  private enforceRetention(tenantId: string): void {
    const bucket = this.state.recordsByTenant.get(tenantId);
    if (!bucket) return;
    const limit = maxRows(this.options.maxRows);
    const records = [...bucket.records.values()].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
    for (const record of records.slice(0, Math.max(0, records.length - limit))) {
      bucket.records.delete(record.runId);
      this.state.recordsById.delete(record.runId);
    }
    if (bucket.records.size === 0) {
      this.state.recordsByTenant.delete(tenantId);
    }
  }

  private toIntelligenceEvent(
    runId: CommandPlanId,
    traceId: CommandTraceId,
    signal: CommandSignalRecord,
    index: number,
  ): CommandIntelligenceEvent {
    return {
      eventId: `${runId}:${index}`,
      tenantId: signal.tenantId,
      streamId: signal.streamId,
      traceId,
      pluginId: signal.context[0],
      pluginName: signal.context[1],
      stepId: signal.context[2],
      signalCount: Object.keys(signal.payload ?? {}).length,
      at: now(),
      signals: toSignals(signal.payload),
    };
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
    this.state.recordsById.clear();
    this.state.recordsByTenant.clear();
  }

  public [Symbol.dispose](): void {
    void this[Symbol.asyncDispose]();
  }
}

const toSignals = (payload: Record<string, unknown>): readonly StreamHealthSignal[] => {
  const stream = payload['streamId'];
  const level = payload['status'];
  return Object.entries(payload).map(([name, value]) => ({
    tenant: asTenantId('tenant:store'),
    streamId: String(stream ?? 'stream-unknown'),
    level: level === 'critical' || level === 'warning' ? level : 'ok',
    score: typeof value === 'number' ? value : Number(Boolean(value)),
    details: [name],
    observedAt: now(),
  }));
};

export const appendSignal = (input: AppendSignalInput): CommandSignalRecord => ({
  envelopeId: `${input.traceId}:${input.stepId}` as CommandEnvelopeId,
  tenantId: input.tenantId,
  streamId: input.streamId,
  namespace: input.namespace,
  payload: {
    ...input.payload,
    trace: input.traceId,
    plugin: input.pluginId,
  },
  context: [input.pluginId, input.pluginName, input.stepId],
});

export const withStoreScope = async <T>(
  factory: () => InMemoryCommandIntelligenceStore,
  task: (store: InMemoryCommandIntelligenceStore) => Promise<T>,
): Promise<T> => {
  const stack = new AsyncStack();
  const store = factory();
  stack.adopt(store, (next) => next[Symbol.asyncDispose]());
  try {
    return await task(store);
  } finally {
    await stack[Symbol.asyncDispose]();
  }
};
