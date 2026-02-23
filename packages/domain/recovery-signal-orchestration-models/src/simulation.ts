import type { SignalCampaignSignal, CampaignTimelineStep, CampaignRun, CampaignRunId, CampaignState } from './contracts';

export interface SimulationInput {
  readonly runId: CampaignRunId;
  readonly mode: 'normal' | 'degraded' | 'stress';
  readonly timeline: readonly CampaignTimelineStep[];
  readonly signals: readonly SignalCampaignSignal[];
  readonly noiseRatio: number;
}

export interface SimulationStepResult {
  readonly timestamp: string;
  readonly stepIndex: number;
  readonly dimension: string;
  readonly impact: number;
  readonly drift: number;
  readonly success: boolean;
}

export interface SimulationReport {
  readonly runId: string;
  readonly state: CampaignState;
  readonly score: number;
  readonly outcomes: readonly SimulationStepResult[];
  readonly completionRatio: number;
}

const computeNoise = (seed: number): number => {
  let state = seed;
  return ((state = (state * 1664525 + 1013904223) >>> 0), (state % 1000) / 1000);
};

const deterministicHash = (input: string): number => {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) >>> 0;
  }
  return value;
};

export const simulateSignalImpact = (
  signal: SignalCampaignSignal,
  baselineNoise: number,
  modeFactor: number,
): number => {
  const drift = signal.impactProjection * (1 + baselineNoise) * modeFactor;
  const normalized = Math.max(0, Math.min(1, drift));
  const burstPenalty = signal.burst > 100 ? 0.1 : 0;
  return Number((normalized - burstPenalty).toFixed(4));
};

export const evaluateTimeline = (
  input: SimulationInput,
): readonly SimulationStepResult[] => {
  const modeFactor = input.mode === 'stress' ? 1.15 : input.mode === 'degraded' ? 0.65 : 0.9;
  const seed = deterministicHash(`${input.runId}:${input.signals.length}:${input.timeline.length}`);
  const noiseBase = computeNoise(seed);

  const outcomes = input.timeline.map((step, index) => {
    const signal = input.signals[index % input.signals.length];
    const noise = (noiseBase + (index + 1) * 0.013) * (1 - input.noiseRatio);
    const impact = simulateSignalImpact(signal, Number(noise.toFixed(4)), modeFactor);
    const drift = Number((impact * step.confidence).toFixed(4));
    const success = impact > 0.2 && step.confidence > 0.1;
    return {
      timestamp: new Date(Date.now() + index * step.etaMinutes * 60_000).toISOString(),
      stepIndex: step.sequence,
      dimension: step.dimension,
      impact,
      drift,
      success,
    };
  });

  return outcomes;
};

export const summarizeSimulation = (run: CampaignRun, outcomes: readonly SimulationStepResult[]): SimulationReport => {
  const complete = outcomes.filter((entry) => entry.success).length;
  const score = outcomes.length === 0
    ? 0
    : Number((outcomes.reduce((acc, entry) => acc + (entry.success ? entry.impact + entry.drift : 0), 0) / outcomes.length).toFixed(4));
  const completionRatio = outcomes.length === 0 ? 0 : Number((complete / outcomes.length).toFixed(4));

  const state: CampaignState = completionRatio >= 0.85
    ? 'completed'
    : completionRatio >= 0.25
      ? 'active'
      : run.state;

  return {
    runId: run.id,
    state,
    score,
    outcomes,
    completionRatio,
  };
};

export const applySimulationToScore = (
  initial: number,
  outcomes: readonly SimulationStepResult[],
): number => {
  if (outcomes.length === 0) {
    return initial;
  }

  const successImpact = outcomes.reduce((acc, outcome) => acc + (outcome.success ? outcome.impact : 0), 0);
  const driftPenalty = outcomes.reduce((acc, outcome) => acc + outcome.drift * 0.1, 0);
  const finalScore = initial + successImpact - driftPenalty;
  return Number(Math.max(0, Math.min(1, finalScore)).toFixed(4));
};
