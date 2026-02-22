import type { FusionBundle, FusionWave, FusionWaveId } from './types';
import { calculateRiskVector, normalizeSignalWeight } from './planner';

export interface ReadinessSnapshot {
  readonly waveId: FusionWaveId;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly commandCount: number;
  readonly signalCount: number;
  readonly readinessScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly stabilityIndex: number;
}

export interface BundleReadinessProfile {
  readonly bundleId: string;
  readonly planId: string;
  readonly runId: string;
  readonly averageReadiness: number;
  readonly minReadiness: number;
  readonly maxReadiness: number;
  readonly snapshots: readonly ReadinessSnapshot[];
  readonly isStable: boolean;
}

const normalizeState = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const toNumber = (raw: unknown, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const timeToSeconds = (start: string, end: string): number => {
  const value = new Date(end).valueOf() - new Date(start).valueOf();
  if (!Number.isFinite(value)) return 0;
  return value / 1000;
};

const computeWaveStability = (wave: FusionWave): number => {
  const risk = calculateRiskVector(wave.readinessSignals, wave.readinessSignals.length);
  const signalWeight = wave.readinessSignals.length > 0 ? wave.readinessSignals.reduce((sum, signal) => sum + signal.severity, 0) / wave.readinessSignals.length : 0;
  const commandPressure = normalizeState(wave.commands.length / 8);
  return normalizeState((1 - risk.riskIndex * normalizeSignalWeight(signalWeight * 0.1) - commandPressure * 0.2) + wave.score * 0.4);
};

const summarizeWave = (wave: FusionWave): ReadinessSnapshot => {
  const signals = wave.readinessSignals.length;
  const commandCount = wave.commands.length;
  const risk = calculateRiskVector(wave.readinessSignals, signals || 1);
  const duration = timeToSeconds(wave.windowStart, wave.windowEnd);
  const durationScore = normalizeState(Math.max(0.2, Math.min(1, 1 - duration / 7200)));

  return {
    waveId: wave.id,
    windowStart: wave.windowStart,
    windowEnd: wave.windowEnd,
    commandCount,
    signalCount: signals,
    readinessScore: computeWaveStability(wave),
    riskScore: risk.riskIndex,
    confidence: risk.confidence,
    stabilityIndex: normalizeState(durationScore * wave.score),
  };
};

export const buildReadinessProfile = (bundle: FusionBundle): BundleReadinessProfile => {
  const snapshots = bundle.waves.map((wave) => summarizeWave(wave));
  const averageReadiness = snapshots.length
    ? snapshots.reduce((sum, snapshot) => sum + snapshot.readinessScore, 0) / snapshots.length
    : 0;
  const minReadiness = snapshots.length ? Math.min(...snapshots.map((snapshot) => snapshot.readinessScore)) : 0;
  const maxReadiness = snapshots.length ? Math.max(...snapshots.map((snapshot) => snapshot.readinessScore)) : 0;
  const isStable = snapshots.every((snapshot) => snapshot.readinessScore > 0.45) && averageReadiness > 0.52;

  return {
    bundleId: String(bundle.id),
    planId: String(bundle.planId),
    runId: String(bundle.runId),
    averageReadiness: averageReadiness,
    minReadiness,
    maxReadiness,
    snapshots,
    isStable,
  };
};

export const scoreReadinessShift = (bundle: FusionBundle, signalId: string): number => {
  const profile = buildReadinessProfile(bundle);
  const signalSignals = bundle.signals.filter((signal) => signal.id === signalId);
  const signalWeight = normalizeSignalWeight(signalSignals.length / Math.max(1, bundle.signals.length));
  const current = profile.averageReadiness;
  const signalRisk = signalSignals.length > 0 ? calculateRiskVector(signalSignals, signalSignals.length).severity : 0;
  const shift = (signalWeight - signalRisk) * toNumber(signalSignals.length, 1);
  return normalizeState(current + shift / 10);
};
