import type { IncidentLabScenario, IncidentLabSignal, IncidentLabPlan, StepId } from './types';
import { createClock } from './types';

export interface SignalTrend {
  readonly kind: IncidentLabSignal['kind'];
  readonly average: number;
  readonly peak: number;
  readonly latest: number;
}

export interface RiskBand {
  readonly signal: IncidentLabSignal['kind'];
  readonly value: 'green' | 'yellow' | 'red';
  readonly note: string;
}

export interface PlanRiskScore {
  readonly scenarioId: IncidentLabScenario['id'];
  readonly severity: IncidentLabScenario['severity'];
  readonly score: number;
  readonly bands: readonly RiskBand[];
}

export interface RiskMatrix<TLabel extends string = string> {
  readonly rows: readonly TLabel[];
  readonly columns: readonly TLabel[];
  readonly matrix: Record<TLabel, Record<TLabel, number>>;
}

export const summarizeSignalTrends = (signals: readonly IncidentLabSignal[]): SignalTrend[] => {
  const grouped = new Map<IncidentLabSignal['kind'], IncidentLabSignal[]>();
  for (const signal of signals) {
    grouped.set(signal.kind, [...(grouped.get(signal.kind) ?? []), signal]);
  }

  const out: SignalTrend[] = [];
  for (const [kind, items] of grouped.entries()) {
    if (items.length === 0) {
      continue;
    }
    const values = items.map((item) => item.value);
    const average = values.reduce((acc, value) => acc + value, 0) / values.length;
    const peak = Math.max(...values);
    const latest = values[values.length - 1] ?? 0;
    out.push({ kind, average: Number(average.toFixed(2)), peak, latest });
  }
  return out;
};

export const classifySignal = (trend: SignalTrend): RiskBand['value'] => {
  if (trend.peak < 50) return 'green';
  if (trend.average < 70) return 'yellow';
  return 'red';
};

export const compileRiskBands = (signals: readonly IncidentLabSignal[]): readonly RiskBand[] =>
  summarizeSignalTrends(signals).map((signal) => ({
    signal: signal.kind,
    value: classifySignal(signal),
    note: `${signal.kind} avg=${signal.average} peak=${signal.peak} latest=${signal.latest}`,
  }));

export const computePlanRisk = (scenario: IncidentLabScenario, signals: readonly IncidentLabSignal[], plan: IncidentLabPlan): PlanRiskScore => {
  const bands = compileRiskBands(signals);
  const redCount = bands.filter((band) => band.value === 'red').length;
  const yellowCount = bands.filter((band) => band.value === 'yellow').length;
  const severityBase = scenario.severity.length * 11;
  const planFactor = Math.min(50, plan.queue.length * 2);
  const signalFactor = redCount * 15 + yellowCount * 5;
  const score = Math.max(0, Math.min(100, severityBase + planFactor + signalFactor));
  return {
    scenarioId: scenario.id,
    severity: scenario.severity,
    score,
    bands,
  };
};

export const topologicalRiskCoverage = (plan: IncidentLabPlan, critical: readonly StepId[]): Readonly<Record<StepId, boolean>> => {
  const map: Record<StepId, boolean> = {} as Record<StepId, boolean>;
  for (const stepId of plan.selected) {
    map[stepId] = false;
  }
  for (const stepId of critical) {
    if (map[stepId] !== undefined) {
      map[stepId] = true;
    }
  }
  return map;
};

export const buildRiskReport = (
  risk: PlanRiskScore,
  coverage: Readonly<Record<StepId, boolean>>,
): string[] => {
  const protectedCount = Object.values(coverage).filter(Boolean).length;
  const total = Object.keys(coverage).length;
  return [
    `scenario=${risk.scenarioId}`,
    `score=${risk.score}`,
    `coverage=${protectedCount}/${total}`,
    `bands=${risk.bands.length}`,
    `createdAt=${createClock().now()}`,
  ];
};

export const normalizeRiskScore = (input: number): number => Math.min(100, Math.max(0, Math.round(input)));

export const buildRiskMatrix = (rows: readonly string[], columns: readonly string[]): RiskMatrix<string> => {
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    matrix[row] = {};
    for (const column of columns) {
      matrix[row][column] = ((row.length + column.length) % 11) / 10;
    }
  }
  return { rows, columns, matrix };
};

export const summarizeRiskMatrix = (matrix: RiskMatrix<string>): string[] => {
  return matrix.rows.flatMap((row) =>
    matrix.columns.map((column) => `${row}|${column}=${matrix.matrix[row]?.[column] ?? 0}`),
  );
};
