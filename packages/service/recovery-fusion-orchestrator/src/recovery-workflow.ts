import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type {
  CommandGraph,
  CommandSynthesisResult,
  CommandSynthesisPlan,
  CommandTraceId,
  CommandWaveId,
  CommandSynthesisRecord,
  CommandNodeId,
} from '@domain/recovery-command-orchestration';
import { buildForecast, buildTopology, toSynthesisResult } from '@domain/recovery-command-orchestration';
import { buildSynthesisSnapshot, normalizeSnapshotCursor, toWindow } from '@domain/recovery-command-orchestration';
import type { CommandGraphStoreRepository } from '@data/recovery-command-graph-store';
import { createRecoveryCommandGraphStore } from '@data/recovery-command-graph-store';

export interface RecoveryWorkflowInput {
  readonly graph: CommandGraph;
  readonly runId: string;
  readonly operator: string;
  readonly tenant: string;
}

export interface RecoveryWorkflowTrace {
  readonly traceId: CommandTraceId;
  readonly tracePath: readonly string[];
  readonly generatedAt: string;
  readonly operator: string;
}

export interface RecoveryWorkflowOutput {
  readonly plan: CommandSynthesisPlan;
  readonly result: CommandSynthesisResult;
  readonly trace: RecoveryWorkflowTrace;
}

export interface WorkflowStep {
  readonly waveId: CommandWaveId;
  readonly order: number;
  readonly state: 'queued' | 'ready' | 'active' | 'complete';
  readonly nodeCount: number;
}

const estimateReadinessBuckets = (readinessScore: number) =>
  readinessScore >= 90 ? 'excellent' : readinessScore >= 75 ? 'good' : readinessScore >= 60 ? 'warn' : 'critical';

export class RecoveryWorkflowEngine {
  private readonly store: CommandGraphStoreRepository;
  private readonly traceMap = new Map<string, RecoveryWorkflowTrace>();
  private readonly stepHistory: Record<string, WorkflowStep[]> = {};

  constructor(store?: CommandGraphStoreRepository) {
    this.store = store ?? createRecoveryCommandGraphStore();
  }

  async synthesize(input: RecoveryWorkflowInput): Promise<Result<RecoveryWorkflowOutput, Error>> {
    const topology = buildTopology(input.graph);
    const forecast = buildForecast(input.graph);
    const snapshot = buildSynthesisSnapshot(input.graph);

    const now = new Date().toISOString();
    const trace: RecoveryWorkflowTrace = {
      traceId: withBrand(`${input.graph.id}:${input.runId}:${now}`, 'CommandTraceId'),
      tracePath: [input.graph.id, input.runId, input.tenant],
      generatedAt: now,
      operator: input.operator,
    };
    this.traceMap.set(input.graph.id, trace);

    const steps: WorkflowStep[] = topology.ordered.map((nodeId: CommandNodeId, index: number) => {
      const bucket = nodeId.split(':')[2] ?? '0';
      return {
        waveId: withBrand(`${input.graph.id}:wave:${Math.min(100, index)}`, 'CommandWaveId'),
        order: index,
        state: index === 0 ? 'ready' : 'queued',
        nodeCount: Math.max(1, Number(bucket) % 6),
      };
    });

    this.stepHistory[input.graph.id] = steps;
    const result: CommandSynthesisResult = {
      ...toSynthesisResult(input.graph),
      conflicts: toSynthesisResult(input.graph).conflicts,
      forecastMinutes: Math.max(1, forecast.readyInMs / 1000 / 60),
    };

    const saved = await this.store.saveEnvelope({
      id: `${input.graph.id}:store` as never,
      graph: input.graph,
      createdAt: now,
    });
    if (!saved.ok) return fail(saved.error);

    const window = toWindow(input.graph.id, 30);
    const normalized = normalizeSnapshotCursor(window.graphId);
    if (!normalized.cursor) return fail(new Error('cursor-missing'));

    const plan: CommandSynthesisPlan = {
      graphId: input.graph.id,
      planName: `${input.tenant}-${input.runId}:recovery-workflow`,
      runId: input.runId,
      requestedBy: input.operator,
      tenant: input.tenant,
      waveCount: Math.max(1, topology.layers.length),
      snapshot,
      query: {
        tenant: input.tenant,
        graphId: input.graph.id,
        limit: Math.max(1, input.graph.nodes.length),
        cursor: normalized.cursor,
      },
    };

    const snapshotRecords = [
      {
        id: withBrand(`${input.graph.id}:record:workflow:${window.since}`, 'CommandSynthesisRecordId'),
        graphId: input.graph.id,
        planId: withBrand(`${input.graph.id}:plan`, 'CommandPlanId'),
        runId: withBrand(`${input.runId}`, 'RecoveryRunId'),
        outcome: result,
        request: {
          tenant: input.tenant,
          operator: input.operator,
          reason: `${estimateReadinessBuckets(result.readinessScore)}-${result.executionOrder.length}`,
        },
        createdAt: now,
      },
    ];
    await this.store.appendRecords(input.graph.id, snapshotRecords);

    return ok({
      plan,
      result,
      trace,
    });
  }

  async inspect(graphId: string): Promise<ReadonlyArray<WorkflowStep>> {
    return this.stepHistory[graphId] ?? [];
  }

  async readLatest(graphId: string): Promise<CommandSynthesisRecord[]> {
    return this.store.readRecords(graphId, 20) as Promise<CommandSynthesisRecord[]>;
  }
}

export const createRecoveryWorkflowEngine = (store?: CommandGraphStoreRepository): RecoveryWorkflowEngine =>
  new RecoveryWorkflowEngine(store);
