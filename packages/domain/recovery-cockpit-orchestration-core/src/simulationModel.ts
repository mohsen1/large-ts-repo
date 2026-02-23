import { RecoveryIntent, RecoveryStep, totalExpectedMinutes, estimateUrgencyScore } from './intentDefinition';
import { RiskAssessment, evaluateRisk } from './riskSignals';

export type StepProjection = Readonly<{
  key: string;
  fromAt: string;
  toAt: string;
  eta: number;
  owner: string;
  action: string;
  risk: number;
}>;

export type TrajectoryPoint = Readonly<{
  at: string;
  value: number;
  label: 'plan' | 'inflight' | 'post';
  notes: ReadonlyArray<string>;
}>;

export type SimulationScenario = Readonly<{
  scenarioId: string;
  intentId: string;
  confidence: number;
  projectedMinutes: number;
  projectedRecovery: ReadonlyArray<TrajectoryPoint>;
  steps: ReadonlyArray<StepProjection>;
  risk: RiskAssessment;
  recommendation: 'execute' | 'delay' | 'stagger';
}>;

export type SimulationReport = Readonly<{
  intentId: string;
  scenarios: ReadonlyArray<SimulationScenario>;
  selectedScenario: string;
  summary: string;
  generatedAt: string;
}>;

export type SimulationEnvelope = Readonly<{
  intentId: string;
  scenarios: ReadonlyArray<SimulationScenario>;
  baseline: number;
  varianceMinutes: number;
  quality: 'low' | 'medium' | 'high';
}>;

const toMinutes = (anchor: number, delta: number) => new Date(anchor + delta * 60_000).toISOString();

const simulateStepPath = (intent: RecoveryIntent, step: RecoveryStep, startAt: number, jitter: number): StepProjection => {
  const duration = step.expectedMinutes + (jitter - 0.5) * 6;
  const eta = Math.max(1, Math.round(duration + step.riskAdjustment * 0.03));
  const from = toMinutes(startAt, 0);
  const to = toMinutes(startAt, eta);
  return {
    key: step.key,
    fromAt: from,
    toAt: to,
    eta,
    owner: step.operator,
    action: step.action,
    risk: step.riskAdjustment,
  };
};

const computeProjection = (steps: readonly RecoveryStep[], intent: RecoveryIntent): ReadonlyArray<StepProjection> => {
  let cursor = Date.now();
  return steps.map((step, index) => {
    const jitter = ((step.key.length + index + step.expectedMinutes) % 10) / 10;
    const projected = simulateStepPath(intent, step, cursor, jitter);
    cursor = new Date(projected.toAt).getTime();
    return projected;
  });
};

const trajectoryForScenario = (
  projection: readonly StepProjection[],
  projectedMinutes: number,
): ReadonlyArray<TrajectoryPoint> => {
  const baseline = projectedMinutes - 10;
  const points: TrajectoryPoint[] = [
    { at: projection[0]?.fromAt ?? new Date().toISOString(), value: baseline, label: 'plan', notes: ['Plan accepted'] },
  ];

  let cumulative = baseline;
  for (const step of projection) {
    cumulative += 2;
    points.push({ at: step.fromAt, value: cumulative, label: 'inflight', notes: [`${step.key} started`, `eta ${step.eta}m`] });
    cumulative -= 1;
    points.push({ at: step.toAt, value: cumulative, label: 'inflight', notes: [`${step.key} stabilized`] });
  }

  points.push({
    at: projection.length ? projection.at(-1)?.toAt ?? new Date().toISOString() : new Date().toISOString(),
    value: 100,
    label: 'post',
    notes: ['Recovery target reached'],
  });

  return points;
};

const scenarioId = (intentId: string, profile: string): string => `${intentId}:sim-${profile}:${Math.random().toString(36).slice(2, 8)}`;

const makeRecommendation = (risk: number, urgency: number): SimulationScenario['recommendation'] => {
  if (urgency >= 70 && risk < 70) return 'execute';
  if (risk >= 85) return 'delay';
  return 'stagger';
};

const computeVariance = (projection: readonly StepProjection[], base: number): number => {
  const spread = projection.reduce((acc, step) => {
    const delta = Math.abs(step.eta - (step.risk / 5 + 1));
    return acc + delta;
  }, 0);
  return Math.max(2, Math.min(35, spread));
};

const buildScenario = (intent: RecoveryIntent, profile: 'fast' | 'balanced' | 'safe', multiplier: number): SimulationScenario => {
  const risk = evaluateRisk(intent);
  const steps = intent.steps;
  const baseProjection = computeProjection(steps, intent);
  const projectedMinutes = baseProjection.reduce((acc, step) => acc + step.eta, 0) * multiplier;
  const adjusted: ReadonlyArray<StepProjection> = baseProjection.map((step) => ({
    ...step,
    eta: Math.round(step.eta * multiplier),
    fromAt: toMinutes(new Date(step.fromAt).getTime(), step.eta * (multiplier - 1)),
    toAt: toMinutes(new Date(step.toAt).getTime(), step.eta * (multiplier - 1)),
  }));

  return {
    scenarioId: scenarioId(intent.intentId, profile),
    intentId: intent.intentId,
    confidence: risk.vector.confidence,
    projectedMinutes: Number(projectedMinutes.toFixed(1)),
    projectedRecovery: trajectoryForScenario(adjusted, projectedMinutes),
    steps: adjusted,
    risk,
    recommendation: makeRecommendation(risk.compositeScore, estimateUrgencyScore(intent)),
  };
};

export const simulateIntentRecovery = (intent: RecoveryIntent): SimulationReport => {
  const risk = evaluateRisk(intent);
  const [fast, balanced, safe] = [1.0, 1.22, 1.55].map((multiplier, index) =>
    buildScenario(intent, index === 0 ? 'fast' : index === 1 ? 'balanced' : 'safe', multiplier),
  );
  const scenarios = [fast, balanced, safe];
  const envelope: SimulationEnvelope = {
    intentId: intent.intentId,
    scenarios,
    baseline: totalExpectedMinutes(intent),
    varianceMinutes: computeVariance(scenarios[0].steps, totalExpectedMinutes(intent)),
    quality: risk.vector.confidence > 0.82 ? 'high' : risk.vector.confidence > 0.63 ? 'medium' : 'low',
  };

  const selectedScenario = scenarios.find((scenario) => scenario.recommendation === 'execute')?.scenarioId ?? scenarios[1].scenarioId;

  return {
    intentId: intent.intentId,
    scenarios,
    selectedScenario,
    summary:
      `Risk=${risk.compositeScore.toFixed(1)} ${risk.recommendation};` +
      ` urgency=${estimateUrgencyScore(intent)}; ` +
      `quality=${envelope.quality}; ` +
      `variance=${envelope.varianceMinutes}m`,
    generatedAt: new Date().toISOString(),
  };
};

export const pickBestScenario = (report: SimulationReport): SimulationScenario =>
  report.scenarios.reduce((best, current) =>
    estimateScore(current) > estimateScore(best) ? current : best,
  report.scenarios[0]!);

export const estimateScore = (scenario: SimulationScenario): number => {
  const base = scenario.risk.compositeScore;
  const confidence = scenario.confidence * 100;
  const trajectoryHeadroom = scenario.projectedRecovery.reduce((acc, point) => acc + point.value, 0) / scenario.projectedRecovery.length;
  return Number((trajectoryHeadroom - base - scenario.projectedMinutes + confidence).toFixed(3));
};

export const summarizeScenario = (scenario: SimulationScenario): string =>
  `${scenario.scenarioId} ${scenario.recommendation} projected=${scenario.projectedMinutes}m confidence=${scenario.confidence}`;
