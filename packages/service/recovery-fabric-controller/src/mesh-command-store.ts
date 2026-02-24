import type {
  MeshOrchestrationOutput,
  MeshRuntimeEvent,
  MeshPhase,
  MeshWave,
  MeshWaveCommandId,
} from '@domain/recovery-fusion-intelligence';
import { appendEvent } from './mesh-lifecycle';
import { asMeshRuntimeMarker } from '@domain/recovery-fusion-intelligence';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

export interface CommandStoreBucket {
  readonly byPhase: Record<MeshPhase, readonly MeshWaveCommandId[]>;
  readonly totalCount: number;
}

export interface CommandStoreSnapshot {
  readonly runId: MeshOrchestrationOutput['runId'];
  readonly buckets: CommandStoreBucket;
  readonly events: readonly MeshRuntimeEvent[];
  readonly stale: readonly MeshWave[];
}

const bucketByPhase = (waves: readonly MeshWave[]): CommandStoreBucket => {
  const map: Record<MeshPhase, MeshWaveCommandId[]> = {
    ingest: [],
    normalize: [],
    plan: [],
    execute: [],
    observe: [],
    finish: [],
  };
  for (const wave of waves) {
    const phase = wave.id.includes('plan') ? 'plan' : 'execute';
    map[phase].push(...wave.commandIds);
  }

  return {
    byPhase: map,
    totalCount: waves.reduce((acc, wave) => acc + wave.commandIds.length, 0),
  };
};

const normalizeBuckets = (bucket: CommandStoreBucket): CommandStoreBucket => ({
  byPhase: {
    ingest: Object.freeze([...bucket.byPhase.ingest]),
    normalize: Object.freeze([...bucket.byPhase.normalize]),
    plan: Object.freeze([...bucket.byPhase.plan]),
    execute: Object.freeze([...bucket.byPhase.execute]),
    observe: Object.freeze([...bucket.byPhase.observe]),
    finish: Object.freeze([...bucket.byPhase.finish]),
  },
  totalCount: bucket.totalCount,
});

export const buildStoreSnapshot = (output: MeshOrchestrationOutput, previous: readonly MeshRuntimeEvent[]): CommandStoreSnapshot => ({
  runId: output.runId,
  buckets: normalizeBuckets(bucketByPhase(output.waves)),
  events: appendEvent(
      {
        runId: output.runId,
        phase: output.phases[0],
        marker: asMeshRuntimeMarker(output.phases[0]),
        payload: {
          waveCount: output.waves.length,
          commandCount: output.commandIds.length,
        },
    },
    previous,
  ),
  stale: output.waves.filter((wave, index) => index % 2 === 1),
});

export const pruneStore = (
  snapshots: readonly CommandStoreSnapshot[],
  output: MeshOrchestrationOutput,
): Result<CommandStoreSnapshot, Error> => {
  if (snapshots.length < 1) {
    return fail(new Error('no snapshots available'));
  }

  const current = snapshots.at(-1);
  if (!current) {
    return fail(new Error('missing last snapshot'));
  }

  return ok({
    ...current,
    buckets: {
      ...current.buckets,
      totalCount: Math.max(current.buckets.totalCount, output.commandIds.length),
    },
    events: appendEvent(
      {
        runId: output.runId,
        phase: output.phases.at(-1) ?? 'finish',
        marker: asMeshRuntimeMarker('finish'),
        payload: {
          pruned: snapshots.length,
          outputWarnings: output.summary.warningCount,
        },
      },
      current.events,
    ),
    stale: current.stale.toSorted(),
  });
};
