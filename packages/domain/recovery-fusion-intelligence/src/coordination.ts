import type { FusionBundle, FusionWave, FusionWaveId } from './types';
import { calculateRiskVector, rankSignals } from './planner';

export interface WaveDependency {
  readonly from: FusionWaveId;
  readonly to: FusionWaveId;
  readonly criticality: number;
}

export interface WaveDependencyPlan {
  readonly waveId: FusionWaveId;
  readonly requiredBefore: readonly FusionWaveId[];
  readonly blocks: readonly FusionWaveId[];
  readonly confidence: number;
  readonly reason: string;
}

export interface CoordinationWindow {
  readonly bundleId: string;
  readonly planId: string;
  readonly runId: string;
  readonly windows: readonly string[];
  readonly dependencies: readonly WaveDependency[];
  readonly dependencyPlans: readonly WaveDependencyPlan[];
  readonly isReady: boolean;
}

const parseTime = (iso: string): number => {
  const now = new Date(iso).getTime();
  return Number.isFinite(now) ? now : Date.now();
}

const scoreWindowOverlap = (windows: readonly FusionWave[]): number => {
  if (windows.length === 0) return 0;
  const sorted = [...windows].sort((left, right) => parseTime(left.windowStart) - parseTime(right.windowStart));
  const first = sorted[0];
  if (!first) return 0;

  let overlapSeconds = 0;
  let currentEnd = parseTime(first.windowEnd);
  for (const wave of sorted.slice(1)) {
    const start = parseTime(wave.windowStart);
    const end = parseTime(wave.windowEnd);
    if (start < currentEnd) {
      overlapSeconds += currentEnd - start;
      currentEnd = Math.max(currentEnd, end);
    } else {
      currentEnd = end;
    }
  }

  return overlapSeconds / 1000;
};

const inferDependencies = (waves: readonly FusionWave[]): readonly WaveDependency[] => {
  const deps: WaveDependency[] = [];

  for (let index = 1; index < waves.length; index += 1) {
    const current = waves[index];
    const previous = waves[index - 1];
    if (!current || !previous) continue;

    const criticality = Math.max(0.1, Math.min(1, (current.score + previous.score) / 2));
    deps.push({
      from: previous.id,
      to: current.id,
      criticality,
    });
  }

  return deps;
};

const deriveDependencyPlan = (wave: FusionWave, allWaves: readonly FusionWave[]): WaveDependencyPlan => {
  const predecessors = allWaves.filter((item) => item.windowEnd < wave.windowStart).map((item) => item.id);
  const successors = allWaves.filter((item) => item.windowStart > wave.windowEnd).map((item) => item.id);
  const signalDensity = rankSignals(wave.readinessSignals);
  const risk = calculateRiskVector(wave.readinessSignals, wave.readinessSignals.length).severity;

  const confidence = Math.max(
    0.1,
    Math.min(1, 1 - Math.abs((signalDensity - 0.5) * 0.2) + (1 - risk) * 0.5 + wave.score * 0.2),
  );

  const reason = confidence > 0.75 ? 'strong dependency evidence' : 'heuristic ordering';

  return {
    waveId: wave.id,
    requiredBefore: predecessors,
    blocks: successors,
    confidence,
    reason,
  };
};

export const buildCoordinationWindow = (bundle: FusionBundle): CoordinationWindow => {
  const deps = inferDependencies(bundle.waves);
  const dependencyPlans = bundle.waves.map((wave) => deriveDependencyPlan(wave, bundle.waves));
  const riskSignalCount = bundle.signals.length;
  const overlaps = scoreWindowOverlap(bundle.waves);
  const isReady = deps.every((dependency) => dependency.criticality > 0.2) && overlaps < 90 * 60 && riskSignalCount > 0;

  const startAt = new Date().toISOString();
  const windowCount = bundle.waves.length + 1;
  const windows = bundle.waves.map((wave, index) => `${startAt}:wave-${index}:${wave.id}`);

  return {
    bundleId: String(bundle.id),
    planId: String(bundle.planId),
    runId: String(bundle.runId),
    windows,
    dependencies: deps,
    dependencyPlans,
    isReady,
  };
};

export const findBlockingWave = (window: CoordinationWindow): FusionWaveId | undefined => {
  const critical = window.dependencyPlans.find((entry) => entry.requiredBefore.length > entry.blocks.length + 1);
  return critical?.waveId;
};

export const describeBlockers = (window: CoordinationWindow): readonly string[] =>
  window.dependencyPlans.map(
    (dependency) =>
      `${dependency.waveId} requires ${dependency.requiredBefore.length} predecessors, blocks ${dependency.blocks.length} followers`,
  );
