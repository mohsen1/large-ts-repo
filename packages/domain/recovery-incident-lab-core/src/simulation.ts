import type {
  IncidentLabRun,
  LabRuntimeVector,
  IncidentLabSignal,
  SignalKind,
  IncidentLabScenario,
  StepId,
} from './types';
import { createClock } from './types';

export interface SimulationConfig {
  readonly stepsPerMinute: number;
  readonly jitterPercent: number;
  readonly startClock?: () => Date;
}

export interface SimulationRecord {
  readonly runId: IncidentLabRun['runId'];
  readonly at: string;
  readonly vector: LabRuntimeVector;
  readonly signals: readonly IncidentLabSignal[];
}

export const clamp = (value: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > 1_000) {
    return 1_000;
  }
  return value;
};

export const applyJitter = (value: number, jitterPercent: number): number => {
  const jitter = (value * jitterPercent) / 100;
  const low = Math.max(0, value - jitter);
  const high = value + jitter;
  return low + (high - low) * 0.5;
};

export const baselineVector = (scenario: IncidentLabScenario): LabRuntimeVector => {
  const severityFactor = scenario.severity.length + 1;
  return {
    throughput: Math.max(1, scenario.steps.length * 3 + severityFactor * 2),
    latencyMs: Math.max(5, 20 + scenario.estimatedRecoveryMinutes * 3),
    integrityScore: Math.max(70, 100 - severityFactor * 5),
  };
};

export const simulateSignal = (
  scenario: IncidentLabScenario,
  step: StepId,
  config: SimulationConfig,
  clock = createClock(),
): IncidentLabSignal => {
  const base = baselineVector(scenario);
  const drift = step.length * (config.stepsPerMinute / 10);
  const kinds: readonly SignalKind[] = ['capacity', 'latency', 'integrity', 'dependency'];
  const kind = kinds[step.length % kinds.length];
  const severityIndex = kinds.indexOf(kind) + 1;
  const value = applyJitter(base.throughput / severityIndex - drift, config.jitterPercent) / (1 + scenario.steps.length / 10);
  return {
    kind,
    node: String(step),
    value: clamp(Number(value.toFixed(2))),
    at: clock.now(),
  };
};

export const buildSimulationTimeline = (
  scenario: IncidentLabScenario,
  planOrder: readonly StepId[],
  config: SimulationConfig,
): readonly SimulationRecord[] => {
  const clock = createClock(config.startClock);
  const timeline: SimulationRecord[] = [];
  const base = baselineVector(scenario);

  for (const [index, step] of planOrder.entries()) {
    const drift = index / Math.max(1, config.stepsPerMinute);
    const throughput = clamp(base.throughput + applyJitter(drift, config.jitterPercent));
    const latencyMs = clamp(base.latencyMs + index);
    const integrityScore = clamp(base.integrityScore - applyJitter(index * 0.4, config.jitterPercent));

    const signals: IncidentLabSignal[] = Array.from({ length: config.stepsPerMinute }, (_, stepIndex) =>
      simulateSignal(scenario, step, config, {
        now: () => clock.now(),
        deltaMillis: () => 0,
      }),
    );

    timeline.push({
      runId: `${scenario.id}:run:${index}` as IncidentLabRun['runId'],
      at: clock.now(),
      vector: {
        throughput,
        latencyMs,
        integrityScore,
      },
      signals,
    });
  }

  return timeline;
};

export const inferRisk = (record: SimulationRecord): 'green' | 'yellow' | 'red' => {
  if (record.vector.integrityScore > 88 && record.vector.latencyMs < 120) {
    return 'green';
  }
  if (record.vector.integrityScore > 70 && record.vector.latencyMs < 300) {
    return 'yellow';
  }
  return 'red';
};
