import { fail, ok, type Result } from '@shared/result';
import { withBrand, normalizeLimit } from '@shared/core';
import type { CommandGraphEnvelope, CommandGraphQuery, CommandGraphTimeline, CommandGraphWriteOptions } from './models';
import { validateCommandGraphEnvelope, validateQuery, resolveStoreId, resolveRecordId, aggregateRecordIds, isSuccessful } from './models';
import type { CommandGraphStoreSnapshot } from './models';
import type { CommandGraph, CommandSynthesisRecord } from '@domain/recovery-command-orchestration';
import type { CommandGraphId } from '@domain/recovery-command-orchestration';

export interface CommandGraphStoreRepository {
  saveEnvelope(envelope: CommandGraphEnvelope): Promise<Result<boolean, Error>>;
  getByGraphId(graphId: string): Promise<CommandGraph | undefined>;
  list(query: CommandGraphQuery): Promise<readonly CommandGraphEnvelope[]>;
  appendRecords(graphId: string, records: readonly CommandSynthesisRecord[]): Promise<Result<readonly string[], Error>>;
  readRecords(graphId: string, take?: number): Promise<readonly CommandSynthesisRecord[]>;
  readTimeline(graphId: string): Promise<CommandGraphTimeline>;
  snapshot(graphId: string): Promise<CommandGraphStoreSnapshot>;
}

interface GraphFrame {
  readonly envelope: CommandGraphEnvelope;
  readonly records: CommandSynthesisRecord[];
}

export class InMemoryRecoveryCommandGraphStore implements CommandGraphStoreRepository {
  private readonly frames = new Map<string, GraphFrame>();
  private readonly timeline = new Map<string, number[]>();
  private readonly tenantIndex = new Map<string, Set<string>>();
  private readonly runIndex = new Map<string, Set<string>>();

  async saveEnvelope(envelope: CommandGraphEnvelope): Promise<Result<boolean, Error>> {
    const parsed = validateCommandGraphEnvelope(envelope);
    if (!parsed.graph.id) {
      return fail(new Error('invalid-graph-id'));
    }

    const key = resolveStoreId(parsed.graph.id);
    const previous = this.frames.get(key);
    if (previous && previous.envelope.graph.metadata.revision >= parsed.graph.metadata.revision) {
      return fail(new Error('stale-revision'));
    }

    this.frames.set(key, { envelope: parsed, records: [...(previous?.records ?? [])] });
    this.trackIndexes(parsed.graph.id, parsed.graph.tenant, parsed.graph.runId);
    this.touchTimeline(parsed.graph.id, parsed.graph.nodes.length);
    return ok(true);
  }

  async getByGraphId(graphId: string): Promise<CommandGraph | undefined> {
    const key = resolveStoreId(graphId);
    const frame = this.frames.get(key);
    return frame?.envelope.graph;
  }

  async list(query: CommandGraphQuery): Promise<readonly CommandGraphEnvelope[]> {
    const validated = validateQuery(query);
    const limit = normalizeLimit(validated.limit);
    const keys = this.matchingKeys(validated);
    const envelopes = keys.map((key) => this.frames.get(key)!.envelope);
    return envelopes.slice(0, limit);
  }

  async appendRecords(graphId: string, records: readonly CommandSynthesisRecord[]): Promise<Result<readonly string[], Error>> {
    const key = resolveStoreId(graphId);
    const frame = this.frames.get(key);
    if (!frame) return fail(new Error('graph-not-found'));

    const added = records.map((record, index) => {
      const safeId = resolveRecordId(graphId, frame.records.length + index + 1);
      const stamped = {
        ...record,
        id: safeId as never,
        graphId: graphId as unknown as CommandGraphId,
      };
      return stamped;
    });
    const next = [...frame.records, ...added];
    this.frames.set(key, { envelope: frame.envelope, records: next });
    this.touchTimeline(graphId, added.length);
    return ok(aggregateRecordIds(next));
  }

  async readRecords(graphId: string, take = 100): Promise<readonly CommandSynthesisRecord[]> {
    const safeTake = Math.min(1000, Math.max(1, normalizeLimit(take)));
    const frame = this.frames.get(resolveStoreId(graphId));
    if (!frame) return [];
    return frame.records.slice(-safeTake).toReversed();
  }

  async readTimeline(graphId: string): Promise<CommandGraphTimeline> {
    const key = resolveStoreId(graphId);
    const frame = this.frames.get(key);
    const frameRecords = frame?.records ?? [];
    const sequence = this.timeline.get(graphId) ?? [];
    return {
      graphId,
      events: frameRecords,
      sequence,
      sampleRateMs: 7_500,
    };
  }

  async snapshot(graphId: string): Promise<CommandGraphStoreSnapshot> {
    const frame = this.frames.get(resolveStoreId(graphId));
    if (!frame) {
      return {
        graphId,
        tenant: 'unknown',
        runId: withBrand(graphId, 'RecoveryRunId'),
        snapshotAt: new Date().toISOString(),
      };
    }
    return {
      graphId,
      tenant: frame.envelope.graph.tenant,
      runId: frame.envelope.graph.runId,
      snapshotAt: new Date().toISOString(),
    };
  }

  private trackIndexes(graphId: string, tenant: string, runId: string) {
    if (!this.tenantIndex.has(tenant)) this.tenantIndex.set(tenant, new Set());
    if (!this.runIndex.has(runId)) this.runIndex.set(runId, new Set());
    this.tenantIndex.get(tenant)?.add(graphId);
    this.runIndex.get(runId)?.add(graphId);
  }

  private touchTimeline(graphId: string, weight: number) {
    const next = this.timeline.get(graphId) ?? [];
    next.push(Math.max(1, weight));
    if (next.length > 300) next.splice(0, next.length - 300);
    this.timeline.set(graphId, next);
  }

  private matchingKeys(query: CommandGraphQuery): readonly string[] {
    const keys = new Set<string>();
    if (query.tenant) {
      const tenantKeys = this.tenantIndex.get(query.tenant) ?? new Set();
      tenantKeys.forEach((key) => keys.add(key));
    }
    if (query.runId) {
      const runKeys = this.runIndex.get(query.runId) ?? new Set();
      runKeys.forEach((key) => keys.add(key));
    }
    if (!query.tenant && !query.runId) {
      this.frames.forEach((_frame, graphId) => keys.add(graphId.replace(/:store$/, '')));
    }
    const ordered = [...keys].toSorted();
    const cursor = query.cursor ?? '';
    return ordered.filter((value) => value > cursor);
  }

  async loadGraphEvents(graphId: string): Promise<readonly CommandSynthesisRecord[]> {
    const records = (this.frames.get(resolveStoreId(graphId))?.records ?? []).filter((record) => isSuccessful(record.outcome));
    return records;
  }

  async replaceGraph(graphId: string, graph: CommandGraph, options?: CommandGraphWriteOptions): Promise<Result<boolean, Error>> {
    const current = this.frames.get(resolveStoreId(graphId));
    if (!current) {
      const envelope: CommandGraphEnvelope = {
        id: resolveStoreId(graphId),
        graph,
        createdAt: new Date().toISOString(),
      };
      return this.saveEnvelope(envelope);
    }

    if (!options?.overwrite && current.envelope.graph.metadata.revision >= graph.metadata.revision) {
      return fail(new Error('revision-conflict'));
    }

    const updated: CommandGraphEnvelope = {
      ...current.envelope,
      graph,
      createdAt: current.envelope.createdAt,
    };
    return this.saveEnvelope(updated);
  }
}

export interface InMemoryRecoveryCommandGraphStoreOptions {
  readonly preload?: readonly CommandGraph[];
}

export const createRecoveryCommandGraphStore = (options?: InMemoryRecoveryCommandGraphStoreOptions): InMemoryRecoveryCommandGraphStore => {
  const store = new InMemoryRecoveryCommandGraphStore();
  for (const graph of options?.preload ?? []) {
    const envelope: CommandGraphEnvelope = {
      id: resolveStoreId(graph.id),
      graph,
      createdAt: new Date().toISOString(),
    };
    void store.saveEnvelope(envelope);
  }
  return store;
};
