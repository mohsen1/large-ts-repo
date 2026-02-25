import type { PlaybookConstraint, PlaybookPhase, PolicySignal, StageResult } from './models';

export interface SimulationInput {
  readonly seed: number;
  readonly constraints: readonly PlaybookConstraint[];
  readonly signals: readonly PolicySignal[];
}

export interface SimulationTrace<T> {
  readonly phase: PlaybookPhase;
  readonly detail: T;
  readonly confidence: number;
}

export interface SimulationOutcome {
  readonly runId: string;
  readonly accepted: boolean;
  readonly traces: readonly SimulationTrace<unknown>[];
  readonly stageResults: readonly StageResult[];
  readonly score: number;
}

export type WeightedSignals = [string, ...readonly [string, ...readonly [number]][]];

const defaultWeights = (constraints: readonly PlaybookConstraint[]): number => {
  const raw = constraints.reduce((acc, item) => acc + Number(item.threshold), 0);
  return Math.max(0, Math.min(100, raw));
};

export const normalizeSignalVector = (signals: readonly PolicySignal[]): readonly string[] =>
  signals
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((signal) => `${signal.metric}:${signal.source}`);

export const evaluateSignals = (signals: readonly PolicySignal[]) => {
  const weighted = signals.reduce((acc, signal) => {
    const bucket = signal.severity;
    const severityBoost = bucket === 'p0' ? 1.5 : bucket === 'p1' ? 1.2 : bucket === 'p2' ? 1 : 0.8;
    return acc + signal.value * severityBoost;
  }, 0);
  return Number.isFinite(weighted) ? weighted : 0;
};

export const simulatePlan = (input: SimulationInput): SimulationOutcome => {
  const signalLines = normalizeSignalVector(input.signals);
  const signalConfidence = evaluateSignals(input.signals);
  const constraintConfidence = defaultWeights(input.constraints);
  const traces = [
    { phase: 'initialized', detail: signalLines.slice(0, 2), confidence: 0.96 },
    { phase: 'simulated', detail: signalConfidence, confidence: Math.min(1, (signalConfidence / 100) + 0.15) },
    { phase: 'audited', detail: constraintConfidence, confidence: Math.min(1, constraintConfidence / 100) },
  ] satisfies readonly SimulationTrace<unknown>[];

  return {
    runId: `sim-${input.seed}`,
    accepted: signalConfidence >= 30 && constraintConfidence >= 10,
    traces,
    stageResults: input.signals.map((signal) => ({
      id: `${signal.metric}` as never,
      status: signal.value > 30 ? 'ok' : 'warn',
      startedAt: new Date().toISOString(),
      durationMs: Math.floor(signal.value),
      payload: signal,
    })),
    score: Math.min(1, (signalConfidence / 100) * (constraintConfidence / 100)),
  };
};

export const traceWeights = (outcome: SimulationOutcome): WeightedSignals => {
  const labels = outcome.traces.map((trace) => `${trace.phase}:${trace.confidence}`);
  return [labels[0] ?? 'sim', ...labels.map((label) => [label, Math.round(label.length)] as const)] as WeightedSignals;
};

export const describeSimulation = (outcome: SimulationOutcome): string[] => {
  const lines: string[] = [];
  for (const trace of outcome.traces) {
    lines.push(`${trace.phase}:${trace.confidence.toFixed(2)}`);
  }
  return lines;
};
