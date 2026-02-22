import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { normalizeLimit, withBrand } from '@shared/core';
import type {
  CommandGraph,
  CommandSynthesisPlan,
  CommandSynthesisRecord,
  CommandSynthesisResult,
} from '@domain/recovery-command-orchestration';
import {
  type CommandGraphQuery,
  type CommandGraphStoreRepository,
  type CommandGraphStoreSnapshot,
  createRecoveryCommandGraphStore,
} from '@data/recovery-command-graph-store';
import { buildLedger } from '@domain/recovery-command-orchestration';
import { planWaves, toSynthesisResult } from '@domain/recovery-command-orchestration';

export interface CommandGraphAdapter {
  upsert(graph: CommandGraph): Promise<Result<CommandGraphStoreSnapshot, Error>>;
  load(graphId: string): Promise<CommandGraph | undefined>;
  append(graph: CommandGraph, plan: CommandSynthesisPlan, outcome: CommandSynthesisResult): Promise<Result<readonly string[], Error>>;
  timeline(graphId: string, query?: CommandGraphQuery): Promise<readonly CommandSynthesisRecord[]>;
}

export class InMemoryCommandGraphAdapter implements CommandGraphAdapter {
  private readonly repository: CommandGraphStoreRepository;

  constructor(repository?: CommandGraphStoreRepository) {
    this.repository = repository ?? createRecoveryCommandGraphStore();
  }

  async upsert(graph: CommandGraph): Promise<Result<CommandGraphStoreSnapshot, Error>> {
    const envelope = {
      id: `${graph.id}:store` as never,
      graph,
      createdAt: new Date().toISOString(),
    };
    const saved = await this.repository.saveEnvelope(envelope);
    if (!saved.ok) {
      return fail(saved.error);
    }
    return ok(await this.repository.snapshot(graph.id));
  }

  async load(graphId: string): Promise<CommandGraph | undefined> {
    return this.repository.getByGraphId(graphId);
  }

  async append(
    graph: CommandGraph,
    plan: CommandSynthesisPlan,
    outcome: CommandSynthesisResult,
  ): Promise<Result<readonly string[], Error>> {
    const snapshotResult = buildLedger(graph, {
      tenant: plan.tenant,
      operator: plan.requestedBy,
      waveWindowMinutes: Math.max(5, plan.waveCount),
      sampleRateMs: 1_000,
    }, []);
    if (!snapshotResult.ok) {
      return fail(snapshotResult.error);
    }

    const records: CommandSynthesisRecord[] = snapshotResult.value.records.map((record) => ({
      ...record,
      id: withBrand(`${plan.graphId}:${Date.now()}:${outcome.executionOrder.length}`, 'CommandSynthesisRecordId'),
      outcome,
      graphId: plan.graphId,
    }));

    const append = await this.repository.appendRecords(plan.graphId, records);
    if (!append.ok) return fail(append.error);
    return ok(append.value);
  }

  async timeline(graphId: string, query: CommandGraphQuery = {}): Promise<readonly CommandSynthesisRecord[]> {
    const limit = normalizeLimit(query.limit);
    const timeline = await this.repository.readTimeline(graphId);
    return timeline.events.filter((record) => record.graphId === graphId).slice(0, limit);
  }
}

const toSynthesisPlan = (graph: CommandGraph): CommandSynthesisPlan => ({
  graphId: graph.id,
  waveCount: Math.max(1, planWaves(graph).length),
  planName: `${graph.tenant}:${graph.rootPlanId}:synthesis`,
  runId: graph.runId,
  requestedBy: graph.metadata.requestedBy,
  tenant: graph.tenant,
  snapshot: {
    cursor: {
      graphId: graph.id,
      index: graph.waves.length,
      windowStart: graph.createdAt,
      windowEnd: graph.updatedAt,
    },
    generatedAt: new Date().toISOString(),
    totalNodes: graph.nodes.length,
    blockedNodes: graph.nodes.filter((node) => node.state === 'blocked').length,
    riskScore: Math.max(1, 100 - graph.nodes.length),
    criticalPathLength: Math.max(1, planWaves(graph).length),
    waveCoverage: Math.max(1, Math.round((graph.waves.length / Math.max(graph.nodes.length, 1)) * 100)),
  },
  query: {
    tenant: graph.tenant,
    graphId: graph.id,
    limit: Math.max(10, graph.nodes.length),
  },
});

export const runCommandGraphSynthesis = async (
  graph: CommandGraph,
  adapter: CommandGraphAdapter,
): Promise<Result<CommandSynthesisPlan, Error>> => {
  const plan = toSynthesisPlan(graph);
  const upserted = await adapter.upsert(graph);
  if (!upserted.ok) return fail(upserted.error);

  const result: CommandSynthesisResult = {
    ...toSynthesisResult(graph),
    forecastMinutes: Math.max(1, Math.ceil(graph.nodes.length / 4)),
  };
  const append = await adapter.append(graph, plan, result);
  if (!append.ok) return fail(append.error);
  return ok(plan);
};
