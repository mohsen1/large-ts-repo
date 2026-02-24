import type { MeshOrchestrationOutput, MeshRuntimeEvent, MeshPriorityEnvelope, MeshPhase } from '@domain/recovery-fusion-intelligence';
import { asMeshRuntimeMarker } from '@domain/recovery-fusion-intelligence';

export interface ObservabilityPulse {
  readonly index: number;
  readonly phase: MeshPhase;
  readonly intensity: number;
  readonly labels: readonly string[];
}

export interface MeshObservabilityDigest {
  readonly runId: MeshOrchestrationOutput['runId'];
  readonly pulses: readonly ObservabilityPulse[];
  readonly warningRatio: number;
}

const buildPulse = (phase: MeshPhase, index: number, score: number): ObservabilityPulse => ({
  index,
  phase,
  intensity: score,
  labels: [phase, String(index), String(score)],
});

const normalizeSignals = (signals: readonly MeshPriorityEnvelope[]): readonly MeshPriorityEnvelope[] =>
  signals.toSorted((left, right) => right.value - left.value);

const scoreWindow = (signals: readonly MeshPriorityEnvelope[]): number =>
  signals.length === 0 ? 0 : signals.reduce((acc, signal) => acc + signal.value, 0) / signals.length;

export const buildObservabilityDigest = (
  output: MeshOrchestrationOutput,
  signals: readonly MeshPriorityEnvelope[],
): MeshObservabilityDigest => {
  const ordered = normalizeSignals(signals);
  const pulses = ordered.map((signal, index) => buildPulse(signal.window, index, signal.value));
  const warningRatio = output.waves.length > 0 ? output.summary.warningRatio : 0;

  return {
    runId: output.runId,
    pulses: Object.freeze(pulses),
    warningRatio: warningRatio + scoreWindow(ordered) * 0.01,
  };
};

export const mergeEvents = (
  base: readonly MeshRuntimeEvent[],
  digest: MeshObservabilityDigest,
): readonly MeshRuntimeEvent[] => [
  ...base,
  ...digest.pulses.map((pulse) => ({
    runId: digest.runId,
    phase: pulse.phase,
    marker: asMeshRuntimeMarker(pulse.phase),
    payload: {
      pulse: pulse.index,
      severity: Math.min(5, pulse.intensity),
      warningRatio: digest.warningRatio,
    },
  })),
];
