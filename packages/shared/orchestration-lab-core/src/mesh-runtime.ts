import {
  executePluginChain,
  type PluginDefinition,
  type PluginResult,
  type CompatibleChain,
} from '@shared/stress-lab-runtime';
import { PluginSession, pluginSessionConfigFrom } from '@shared/stress-lab-runtime';
import { canonicalizeNamespace } from '@shared/stress-lab-runtime';
import { z } from 'zod';
import {
  MeshRunSeed,
  MeshLane,
  MeshMode,
  type MeshInputForChain,
  type MeshOutputForChain,
  type MeshRuntimeState,
  type MeshPluginFingerprint,
  type MeshRunEnvelope,
  type MeshRunOutput,
  type MeshRuntimeEvent,
  buildMeshEnvelope,
  buildMeshContext,
  resolveManifestForLane,
  scoreMeshEnvelope,
  buildMeshManifestDigest,
  buildMeshFingerprint,
  buildMeshDigest,
} from './mesh-types';
import { buildDependencyMatrix, rankByDependency, summarizeGraph } from './mesh-graph';
import { percentile, measureSeries, bucketFromValues, summarizeSeries } from './mesh-metrics';

export interface MeshExecutionTrace {
  readonly step: string;
  readonly pluginId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly ok: boolean;
}

export interface MeshRuntimeResult {
  readonly ok: boolean;
  readonly trace: MeshRunOutput;
  readonly dependencies: {
    readonly namespace: string;
    readonly order: readonly string[];
    readonly cycle: boolean;
  };
  readonly telemetry: {
    readonly checksum: string;
    readonly events: readonly MeshRuntimeEvent[];
    readonly steps: readonly MeshExecutionTrace[];
    readonly timing: {
      readonly min: number;
      readonly max: number;
      readonly avg: number;
      readonly p50: number;
      readonly p90: number;
    };
    readonly ranking: ReadonlyMap<string, number>;
  };
}

export interface MeshRuntimeRunner {
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  run<TChain extends readonly PluginDefinition[]>(
    seed: MeshRunSeed,
    chain: CompatibleChain<TChain> & readonly PluginDefinition[],
    seedPayload: Record<string, unknown>,
  ): Promise<MeshRuntimeResult>;
}

const makeTrace = (
  pluginId: string,
  startedAt: string,
  finishedAt: string,
  ok: boolean,
): MeshExecutionTrace => ({
  step: pluginId,
  pluginId,
  startedAt,
  finishedAt,
  ok,
});

const emit = (kind: MeshRuntimeEvent['kind'], value: number, tags: readonly string[]): MeshRuntimeEvent => ({
  kind,
  value,
  at: new Date().toISOString(),
  tags,
});

const asInput = <TInput>(value: TInput): Record<string, unknown> => value as Record<string, unknown>;

export class MeshOrchestrator implements MeshRuntimeRunner {
  public readonly lane: MeshLane;
  public readonly mode: MeshMode;

  constructor(lane: MeshLane, mode: MeshMode) {
    this.lane = lane;
    this.mode = mode;
  }

  public async run<TChain extends readonly PluginDefinition[]>(
    seed: MeshRunSeed,
    chain: CompatibleChain<TChain> & readonly PluginDefinition[],
    seedPayload: Record<string, unknown>,
  ): Promise<MeshRuntimeResult> {
    const envelope: MeshRunEnvelope = buildMeshEnvelope(seed);
    const manifest = resolveManifestForLane(seed);
    const graph = buildDependencyMatrix(chain);
    const ranking = rankByDependency(graph);
    const startedAt = new Date().toISOString();

    const context = buildMeshContext(seed, z.record(z.unknown()));
    const pluginSession = new PluginSession(
      pluginSessionConfigFrom(seed.tenantId, canonicalizeNamespace(`mesh-run:${seed.lane}`), `${seed.tenantId}:${seed.mode}:${Date.now()}`),
    );

    await using _scope = pluginSession;

    const executionLog: MeshExecutionTrace[] = [];
    const events: MeshRuntimeEvent[] = [];
    const timings: number[] = [];

    const result = await executePluginChain(chain, context, asInput(seedPayload) as MeshInputForChain<TChain>);

    if (!result.ok || result.value === undefined) {
      executionLog.push(
        makeTrace('mesh/failure', startedAt, new Date().toISOString(), false),
      );
      events.push(emit('mesh.simulation.errorRate', 1, ['mesh-runtime', 'failed']));

    return {
      ok: false,
      trace: {
        runId: envelope.runId,
        lane: this.lane,
          mode: this.mode,
          stage: 'failed',
          score: 0,
          confidence: 0,
          signals: seed.selectedSignals,
            payload: { errors: result.errors },
            telemetry: {
            checksum: buildMeshDigest({ ...manifest, pluginCount: graph.order.length }) as MeshPluginFingerprint,
            latencyMs: 0,
            events,
          },
        },
        dependencies: {
          namespace: graph.namespace,
          order: graph.order,
          cycle: graph.cycle,
        },
        telemetry: {
          checksum: buildMeshManifestDigest(manifest),
          events,
          steps: executionLog,
          timing: {
            min: 0,
            max: 0,
            avg: 0,
            p50: 0,
            p90: 0,
          },
          ranking,
        },
      };
    }

    const duration = Date.now() - Date.parse(startedAt);
    timings.push(duration);
    executionLog.push(
      makeTrace('mesh/run', startedAt, new Date().toISOString(), true),
    );
    events.push(emit('mesh.signal.latency', duration, ['mesh-runtime', 'ok']));
    events.push(emit('mesh.signal.throughput', chain.length, ['chain-size']));

    const summary = summarizeSeries([
      { label: 'latency', values: timings },
    ]);

    const fingerprint = buildMeshDigest({ ...manifest, pluginCount: chain.length });

    const score = scoreMeshEnvelope(seed, seed.selectedSignals as any);
    const scoreBucket = bucketFromValues('latency', timings);

    const output: MeshRunOutput = {
      runId: envelope.runId,
      lane: this.lane,
      mode: this.mode,
      stage: 'complete',
      score,
      confidence: Math.min(1, Math.max(0, score)),
      signals: seed.selectedSignals,
      payload: {
        result: result.value as MeshOutputForChain<TChain>,
        constraints: envelope.constraints,
        manifestDigest: fingerprint,
        summary,
        scoreBucket,
        manifestChecksum: buildMeshFingerprint([fingerprint, score.toString(), String(seed.selectedSignals.length)]),
      },
      telemetry: {
        checksum: buildMeshFingerprint([fingerprint, String(duration), graph.order.length.toString()]) as MeshPluginFingerprint,
        latencyMs: duration,
        events,
      },
    };

    return {
      ok: true,
      trace: output,
      dependencies: {
        namespace: graph.namespace,
        order: graph.order,
        cycle: graph.cycle,
      },
      telemetry: {
        checksum: buildMeshFingerprint([envelope.runId, String(chain.length)]),
        events,
        steps: executionLog,
        timing: {
          min: summary.snapshots[0]?.min ?? 0,
          max: summary.snapshots[0]?.max ?? 0,
          avg: duration / Math.max(1, chain.length),
          p50: percentile(measureSeries(timings), 0.5),
          p90: percentile(measureSeries(timings), 0.9),
        },
        ranking,
      },
    };
  }
}

export const createMeshOrchestrator = (lane: MeshLane, mode: MeshMode): MeshRuntimeRunner =>
  new MeshOrchestrator(lane, mode);

export const toTraceSummary = (result: MeshRuntimeResult): string =>
  `${result.trace.runId}|${result.ok ? 'ok' : 'err'}|${summarizeGraph({
    namespace: result.dependencies.namespace,
    nodes: result.dependencies.order,
    edges: result.dependencies.order.map((node) => ({
      from: node,
      to: `${node}::out`,
      requiredBy: ['summary'],
    })),
  })}|timing=${result.telemetry.timing.avg}`;

export const runMeshOrchestrator = async <TChain extends readonly PluginDefinition[]>(
  lane: MeshLane,
  mode: MeshMode,
  seed: MeshRunSeed,
  chain: CompatibleChain<TChain> & readonly PluginDefinition[],
  payload: Record<string, unknown>,
): Promise<MeshRuntimeResult> => {
  const orchestrator = createMeshOrchestrator(lane, mode);
  return orchestrator.run(seed, chain, payload);
};
