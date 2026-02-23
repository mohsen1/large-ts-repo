import { type AlertSignal, type FabricSimulationInput, type CommandId } from './models';
import { FabricPlanner } from './planner';
import { summarizeSignals, computeSignalImpact } from './metrics';

export interface SimulationSeriesPoint {
  readonly timestamp: string;
  readonly stressScore: number;
  readonly riskScore: number;
}

export interface SimulationRunbook {
  readonly runId: string;
  readonly points: readonly SimulationSeriesPoint[];
  readonly notes: readonly string[];
  readonly planSummary?: {
    readonly facility: string;
    readonly signalCount: number;
    readonly safeRuns: number;
  };
}

export const simulateSignalReplay = (input: FabricSimulationInput): SimulationRunbook => {
  const samples: SimulationSeriesPoint[] = [];
  const planner = new FabricPlanner({
    topology: input.topology,
    constraint: input.constraint,
  });

  const ordered = [...input.signals].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  let tick = 0;
  for (const signal of ordered) {
    const stress = computeSignalImpact([signal]);
    const risk = signal.severity === 'incident' ? 0.84 : signal.severity === 'critical' ? 0.65 : 0.26;
    samples.push({
      timestamp: signal.timestamp,
      stressScore: Number((tick ? stress * 0.93 + samples[tick - 1].stressScore * 0.07 : stress).toFixed(4)),
      riskScore: Number((risk + planner.getConstraint().maxRisk * 0.1).toFixed(4)),
    });
    tick += 1;
  }

  const notes: string[] = [];
  const summary = summarizeSignals(ordered);
  notes.push(`Window count ${summary.windows.length}`);
  notes.push(`Trend ${summary.trend.toFixed(4)}`);
  notes.push(`Signal count ${ordered.length}`);

  return {
    runId: `runbook-${input.tenantId}-${Date.now()}`,
    points: samples,
    notes,
  };
};

export const generateWhatIfSignals = (baseSignals: readonly AlertSignal[]): AlertSignal[] => {
  return baseSignals.map((signal, index) => {
    const multiplier = 1 + ((index % 7) - 3) * 0.02;
    return {
      ...signal,
      id: `${signal.id}-whatif-${index}` as CommandId,
      value: Number((signal.value * multiplier).toFixed(3)),
      timestamp: new Date(Date.parse(signal.timestamp) + index * 60_000).toISOString(),
    };
  });
};
