import type {
  OrchestrationSignal,
  RecoveryPlanWindow,
  ScenarioCandidate,
  SignalWindow,
  SimulationEnvelope,
} from './incident-models';
import { buildPlanWindow, buildSignalWindow, createWindowId } from './incident-models';

export interface RiskDimension {
  readonly weightSignal: number;
  readonly weightBudget: number;
  readonly weightWindow: number;
  readonly weightSignals: number;
}

export interface RiskProfile {
  readonly dimension: RiskDimension;
  readonly score: number;
  readonly baseline: number;
  readonly classification: 'safe' | 'caution' | 'danger' | 'critical';
  readonly rationale: readonly string[];
}

export interface CandidateRiskSummary {
  readonly candidateId: string;
  readonly profile: RiskProfile;
  readonly window: RecoveryPlanWindow;
  readonly checks: readonly string[];
  readonly hints: readonly string[];
}

const classify = (score: number): RiskProfile['classification'] => {
  if (score >= 82) return 'critical';
  if (score >= 63) return 'danger';
  if (score >= 41) return 'caution';
  return 'safe';
};

const valueScore = (signals: readonly OrchestrationSignal[]): number => {
  if (signals.length === 0) return 0;
  const sample = signals.reduce((sum, signal) => sum + Math.abs(signal.value), 0) / signals.length;
  return Math.min(100, sample);
};

const budgetScore = (candidate: ScenarioCandidate): number => {
  const denominator = candidate.budget.budgetMinutes + candidate.budget.budgetCostUnits + 1;
  const raw = ((candidate.planWindow.endMinute - candidate.planWindow.startMinute) / denominator) * 100;
  return Math.max(10, Math.min(100, raw));
};

const windowScore = (candidate: ScenarioCandidate): number => {
  const risk = candidate.budget.riskTolerance * 12;
  const duration = candidate.planWindow.endMinute - candidate.planWindow.startMinute;
  const density = candidate.planWindow.signalDensity;
  return Math.min(100, risk * 1.5 + density * 4 + Math.max(0, 120 - duration));
};

const signalCoverageScore = (candidate: ScenarioCandidate, signals: readonly OrchestrationSignal[]): number => {
  const distinct = new Set(signals.map((signal) => signal.signal)).size;
  const templates = new Set(candidate.template.signals).size;
  if (templates === 0) return 0;
  return Math.min(100, (distinct / templates) * 120);
};

const deriveWindow = (candidate: ScenarioCandidate): RecoveryPlanWindow => {
  const confidence = Math.max(1, candidate.planWindow.confidence);
  const weightedRisk = Math.min(100, candidate.budget.riskTolerance * 18 + confidence / 2);
  return buildPlanWindow(0, Math.max(8, candidate.planWindow.endMinute), weightedRisk);
};

const buildRationale = (
  candidate: ScenarioCandidate,
  normalized: [number, number, number, number],
): string[] => {
  const [signalWeight, budgetWeight, windowWeight, stepWeight] = normalized;
  const lines = [
    `signalScore=${signalWeight.toFixed(2)}`,
    `budgetScore=${budgetWeight.toFixed(2)}`,
    `windowScore=${windowWeight.toFixed(2)}`,
    `stepDensity=${stepWeight.toFixed(2)}`,
  ];

  if (candidate.budget.riskTolerance > 3) {
    lines.push('tolerance-aggressive');
  }
  if (candidate.template.steps.length > 4) {
    lines.push('step-dense');
  }
  if (candidate.planWindow.riskScore > 70) {
    lines.push('high-risk-planwindow');
  }
  return lines;
};

export const evaluateCandidateRisk = (
  candidate: ScenarioCandidate,
  signals: readonly OrchestrationSignal[],
  maxWindowMinutes = 120,
): CandidateRiskSummary => {
  const candidates: [number, number, number, number] = [
    valueScore(signals),
    budgetScore(candidate),
    windowScore(candidate),
    signalCoverageScore(candidate, signals),
  ];

  const weights: RiskDimension = {
    weightSignal: candidates[0] / 100,
    weightBudget: candidates[1] / 100,
    weightWindow: candidates[2] / 100,
    weightSignals: candidates[3] / 100,
  };

  const total = Math.round(
    weights.weightSignal * 0.34 +
      weights.weightBudget * 0.22 +
      weights.weightWindow * 0.26 +
      weights.weightSignals * 0.18,
  );

  const safeTotal = Math.min(100, Math.max(0, total));
  const window = deriveWindow(candidate);
  const rationale = buildRationale(candidate, candidates);

  const hints = [
    candidate.budget.maxParallelism < 2 ? 'increase-parallelism' : 'parallelism-ok',
    candidate.template.steps.length < 2 ? 'step-count-low' : 'step-count-adequate',
    candidate.budget.budgetMinutes > maxWindowMinutes ? 'budget-long-window' : 'budget-window-aligned',
  ];

  const checks = [
    ...candidate.template.steps.map((step) => `${step.stepType}:${step.estimatedMinutes}`),
    ...candidate.budget.riskTolerance > 0 ? ['approved-risk-tolerance'] : ['zero-risk-tolerance'],
  ];

  return {
    candidateId: candidate.scenarioId,
    profile: {
      dimension: weights,
      score: safeTotal,
      baseline: safeTotal / 2,
      classification: classify(safeTotal),
      rationale,
    },
    window,
    checks,
    hints,
  };
};

export const mergeRiskSummaries = (
  candidates: readonly CandidateRiskSummary[],
): RiskProfile => {
  if (candidates.length === 0) {
    return {
      dimension: {
        weightSignal: 0.25,
        weightBudget: 0.25,
        weightWindow: 0.25,
        weightSignals: 0.25,
      },
      score: 0,
      baseline: 0,
      classification: 'safe',
      rationale: ['no-candidates'],
    };
  }

  const score = candidates.reduce((sum, candidate) => sum + candidate.profile.score, 0) / candidates.length;
  const baseline = candidates.reduce((sum, candidate) => sum + candidate.profile.baseline, 0) / candidates.length;
  const rationale = Array.from(
    new Set(candidates.flatMap((candidate) => candidate.profile.rationale)).values(),
  ).slice(0, 12);

  return {
    dimension: {
      weightSignal: 0.25,
      weightBudget: 0.25,
      weightWindow: 0.25,
      weightSignals: 0.25,
    },
    score: Math.round(score),
    baseline: Math.round(baseline),
    classification: classify(score),
    rationale,
  };
};

export const normalizeSignalsToWindow = (signals: readonly OrchestrationSignal[], tenantId: string): SignalWindow => {
  const timestamp = signals.length > 0 ? signals[0]?.timestamp ?? new Date().toISOString() : new Date().toISOString();
  const unique = new Set(signals.map((signal) => signal.signal));
  return buildSignalWindow(timestamp, unique.size + 10, createWindowId(tenantId, `window-${unique.size}`));
};

export const buildRiskTrace = (
  candidate: ScenarioCandidate,
  score: CandidateRiskSummary,
): SimulationEnvelope => ({
  id: `${candidate.scenarioId}:risk`,
  revision: candidate.revision,
  candidate,
  traces: [
    {
      when: new Date().toISOString(),
      component: 'risk-calculator',
      message: `${score.profile.classification}:${score.profile.score}`,
      tags: { hints: score.hints.join(',') },
      correlationId: `${candidate.scenarioId}:risk`,
    },
  ],
  windows: [score.window],
  checks: score.checks.map((entry) => ({
    candidateId: candidate.scenarioId,
    passed: true,
    blockedReasons: [],
    warnings: [entry],
  })),
});
