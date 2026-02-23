import type { ContinuitySignal, ContinuityRunResult, ContinuityConstraintViolation, SimulationOutcome } from './types';

export interface TelemetryMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
}

export interface TelemetrySeries {
  readonly title: string;
  readonly metrics: ReadonlyArray<TelemetryMetric>;
}

export interface TelemetryReport {
  readonly scenarioId: string;
  readonly runDate: string;
  readonly riskScore: number;
  readonly coverageScore: number;
  readonly signalCount: number;
  readonly violationCount: number;
  readonly recommendedActionCount: number;
  readonly topSignals: ReadonlyArray<ContinuitySignal>;
}

const normalize = (value: number): number => Number(Math.max(0, Math.min(1, value)).toFixed(3));

export const summarizeSignals = (signals: ReadonlyArray<ContinuitySignal>): TelemetrySeries => ({
  title: 'signal-weights',
  metrics: signals.map((signal) => ({
    name: `${signal.streamId}:${signal.kind}`,
    value: normalize(signal.value / 100),
    unit: 'ratio',
  })),
});

const latestOutcome = (result: ContinuityRunResult): SimulationOutcome | undefined => result.outcomes[0];

export const buildTelemetryReport = (result: ContinuityRunResult, signals: ReadonlyArray<ContinuitySignal>): TelemetryReport => {
  const outcome = latestOutcome(result);
  return {
    scenarioId: result.scenarioId,
    runDate: outcome?.executedAt ?? new Date().toISOString(),
    riskScore: normalize(outcome?.risk ?? 0),
    coverageScore: normalize(outcome?.coverage ?? 0),
    signalCount: signals.length,
    violationCount: outcome?.violations?.length ?? 0,
    recommendedActionCount: outcome?.recommendedActions?.length ?? 0,
    topSignals: [...signals].sort((left, right) => right.value - left.value).slice(0, 3),
  };
};

export const renderViolationSummary = (violations: ReadonlyArray<ContinuityConstraintViolation>): string => {
  if (violations.length === 0) {
    return 'No violations';
  }
  const groups = violations.reduce((acc, item) => {
    const bucket = acc.get(item.severity) ?? [];
    bucket.push(item);
    acc.set(item.severity, bucket);
    return acc;
  }, new Map<string, ContinuityConstraintViolation[]>());
  return [...groups.entries()].map(([severity, list]) => `${severity}=${list.length}`).join(', ');
};
