import { appendEvent } from './mesh-lifecycle';
import {
  asMeshRunId,
  asMeshRuntimeMarker,
  type MeshOrchestrationOutput,
  type MeshRuntimeEvent,
  type MeshRuntimeInput,
  type MeshPhase,
} from '@domain/recovery-fusion-intelligence';

export interface StreamFrame {
  readonly offset: number;
  readonly runtimeId: MeshOrchestrationOutput['runId'];
  readonly payload: string;
}

type RuntimeStreamCursor = {
  readonly cursor: bigint;
  readonly output: MeshOrchestrationOutput;
  readonly events: readonly MeshRuntimeEvent[];
};

const buildFrame = (runtime: MeshOrchestrationOutput, offset: number): StreamFrame => ({
  offset,
  runtimeId: runtime.runId,
  payload: `${runtime.waves.length}:${runtime.commandIds.length}:${runtime.summary.warningRatio}`,
});

export const streamByPhase = async function* (runs: readonly MeshOrchestrationOutput[]): AsyncGenerator<StreamFrame> {
  let cursor: bigint = 0n;
  for (const run of runs) {
    const frame = buildFrame(run, Number(cursor));
    yield frame;
    cursor += 1n;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const bootstrapCursor = (input: MeshRuntimeInput): RuntimeStreamCursor => ({
  cursor: BigInt(input.phases.length + input.nodes.length + input.edges.length),
  output: {
    runId: asMeshRunId(
      'stream',
      input.pluginIds[0] ? `bootstrap-${String(input.pluginIds[0]).replace('plugin:', '')}` : 'bootstrap',
    ),
    status: 'running',
    phases: input.phases,
    waves: [],
    commandIds: [],
    summary: {
      warningRatio: 0,
      warningCount: 0,
      commandCount: 0,
      waveCount: 0,
    },
  },
  events: [],
});

export const replayRuntimeStream = async (
  runtime: MeshRuntimeInput,
  events: readonly MeshRuntimeEvent[],
): Promise<{ cursor: RuntimeStreamCursor; events: readonly MeshRuntimeEvent[] }> => {
  const cursor = bootstrapCursor(runtime);
  const phase = runtime.phases[0] ?? 'ingest';
  const replayRunId = asMeshRunId(
    'replay',
    runtime.pluginIds[0] ? `${String(runtime.pluginIds[0]).replace('plugin:', '')}` : 'runtime',
  );
  const mutated = appendEvent(
    {
      runId: replayRunId,
      phase,
      marker: asMeshRuntimeMarker(phase),
      payload: {
        runtime: runtime.phases.length,
      },
    },
    events,
  );
  return { cursor, events: mutated };
};
