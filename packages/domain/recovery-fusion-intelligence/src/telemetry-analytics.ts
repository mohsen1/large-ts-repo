import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  FusionBundle,
  FusionWave,
  FusionReadinessState,
  FusionTopology,
  FusionTopologyMetrics,
} from './types';
import { analyzeTopology } from './topology';
import { computePriorityHeatmap } from './priority-matrix';

export interface FusionWaveHeartbeat {
  readonly waveId: FusionWave['id'];
  readonly state: FusionReadinessState;
  readonly commandCount: number;
  readonly signalCount: number;
  readonly pressure: number;
  readonly generatedAt: string;
}

export interface BundleTelemetry {
  readonly bundleId: string;
  readonly overallReadiness: number;
  readonly readyWaves: number;
  readonly blockedWaves: number;
  readonly topologyDensity: number;
  readonly heatmapScore: number;
  readonly waveHeartbeats: readonly FusionWaveHeartbeat[];
  readonly topology: FusionTopologyMetrics;
}

const countByState = (waves: readonly FusionWave[]): Readonly<Record<FusionReadinessState, number>> => {
  const result: Record<FusionReadinessState, number> = {
    stable: 0,
    running: 0,
    warming: 0,
    degraded: 0,
    blocked: 0,
    idle: 0,
    failed: 0,
  };
  for (const wave of waves) {
    result[wave.state] += 1;
  }
  return result;
};

const heartbeatForWave = (wave: FusionWave): FusionWaveHeartbeat => ({
  waveId: wave.id,
  state: wave.state,
  commandCount: wave.commands.length,
  signalCount: wave.readinessSignals.length,
  pressure: Math.min(1, (wave.commands.length * 0.1) + (wave.readinessSignals.length / 100)),
  generatedAt: new Date().toISOString(),
});

export const buildBundleTelemetry = (bundle: FusionBundle, topology: FusionTopology): Result<BundleTelemetry, Error> => {
  const metrics = analyzeTopology(topology);
  const heatmap = computePriorityHeatmap(bundle.waves, {
    tenant: bundle.tenant,
    maxCommands: 5,
    minWaveScore: 0.25,
    minSignalConfidence: 0.2,
  });
  if (waveTelemetryLength(bundle.waves) === 0) {
    return fail(new Error('no-waves'));
  }

  const counts = countByState(bundle.waves);
  const total = Math.max(1, bundle.waves.length);
  const ready = counts.stable + counts.running;
  const blocked = counts.blocked + counts.failed;
  const score = heatmap.reduce((sum, item) => sum + item.score, 0) / heatmap.length;

  return ok({
    bundleId: bundle.id,
    overallReadiness: Number((ready / total).toFixed(3)),
    readyWaves: ready,
    blockedWaves: blocked,
    topologyDensity: metrics.density,
    heatmapScore: Number(score.toFixed(4)),
    waveHeartbeats: heatmap.map((item) => {
      const wave = bundle.waves.find((candidate) => candidate.id === item.waveId);
      return heartbeatForWave(wave ?? bundle.waves[0]!);
    }),
    topology: metrics,
  });
};

const waveTelemetryLength = (waves: readonly FusionWave[]): number => waves.length;

export const summarizeTelemetry = (telemetry: BundleTelemetry): string[] => {
  const items = [
    `bundle=${telemetry.bundleId}`,
    `overallReadiness=${telemetry.overallReadiness}`,
    `readyWaves=${telemetry.readyWaves}`,
    `blockedWaves=${telemetry.blockedWaves}`,
    `topologyDensity=${telemetry.topologyDensity}`,
    `heatmapScore=${telemetry.heatmapScore}`,
  ];
  const critical = telemetry.waveHeartbeats
    .filter((wave) => wave.state === 'blocked' || wave.state === 'failed')
    .sort((left, right) => right.pressure - left.pressure)
    .slice(0, 5)
    .map((wave) => `${wave.waveId}:${wave.state}:${wave.pressure}`);
  return [...items, ...critical];
};
