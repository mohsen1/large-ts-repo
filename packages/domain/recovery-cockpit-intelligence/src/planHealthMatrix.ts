import { RecoveryPlan, RecoveryAction, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicies, PolicyMode } from './policies';
import { buildPlanForecast } from './forecast';
import { buildRiskForecast } from './riskForecast';
import { CockpitSignal } from '@domain/recovery-cockpit-models';
import { buildReadinessProfile } from '@domain/recovery-cockpit-workloads';

export type MatrixAxis = 'policy' | 'forecast' | 'readiness' | 'signal';

export type HealthCell = {
  readonly planId: string;
  readonly axis: MatrixAxis;
  readonly bucket: number;
  readonly score: number;
  readonly notes: readonly string[];
};

export type HealthMatrix = {
  readonly generatedAt: UtcIsoTimestamp;
  readonly planId: string;
  readonly cells: readonly HealthCell[];
  readonly severityBand: 'low' | 'medium' | 'high' | 'critical';
  readonly score: number;
  readonly summary: string;
};

export type MatrixConfig = {
  readonly policyMode: PolicyMode;
  readonly includeSignals: boolean;
  readonly signalCap: number;
};

const bucket = (value: number): number => {
  if (value >= 85) return 4;
  if (value >= 70) return 3;
  if (value >= 50) return 2;
  if (value >= 25) return 1;
  return 0;
};

const scorePolicy = (plan: RecoveryPlan, mode: PolicyMode): number => {
  const checks = evaluatePlanPolicies(plan, mode);
  const failed = checks.filter((check) => !check.allowed).length;
  const ratio = checks.length === 0 ? 0 : (failed / checks.length) * 100;
  return Number((100 - ratio * 20).toFixed(2));
};

const scoreForecast = (plan: RecoveryPlan): number => {
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : plan.mode === 'manual' ? 'conservative' : 'balanced');
  return forecast.summary;
};

const scoreReadiness = (plan: RecoveryPlan): number => {
  const profile = buildReadinessProfile(plan);
  return profile.mean;
};

const scoreSignals = (plan: RecoveryPlan, includeSignals: boolean, signals: readonly CockpitSignal[]): number => {
  if (!includeSignals) {
    return 100;
  }
  const critical = signals.filter((signal) => 'severity' in signal && signal.severity === 'critical').length;
  const warning = signals.filter((signal) => 'severity' in signal && signal.severity === 'warning').length;
  const base = Math.max(0, 100 - critical * 20 - warning * 8 - signals.length * 0.5);
  return Number(base.toFixed(2));
};

const bandFor = (score: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 35) return 'high';
  return 'critical';
};

const actionCounts = (actions: readonly RecoveryAction[]) => {
  const critical = actions.filter((action) => action.tags.includes('critical')).length;
  const drained = actions.filter((action) => action.command.includes('drain')).length;
  const long = actions.filter((action) => action.expectedDurationMinutes > 60).length;
  return { critical, drained, long };
};

const noteForPolicy = (checksValue: number, actionCount: number): readonly string[] => {
  const notes: string[] = [];
  if (checksValue < 60) {
    notes.push('policy checks indicate constraint pressure');
  }
  if (actionCount > 20) {
    notes.push('high action fanout');
  }
  return notes;
};

const noteForForecast = (forecastScore: number, actionCount: number): readonly string[] => {
  const notes: string[] = [];
  if (forecastScore < 50) {
    notes.push('forecast risk rising in later windows');
  }
  if (actionCount > 10) {
    notes.push('multiple dependencies increase completion variance');
  }
  return notes;
};

const noteForReadiness = (readiness: number, actionCount: number): readonly string[] => {
  const notes: string[] = [];
  if (readiness < 50) {
    notes.push('readiness weak at baseline');
  }
  if (actionCount === 0) {
    notes.push('empty action graph');
  }
  return notes;
};

const noteForSignals = (signalCount: number): readonly string[] => {
  if (signalCount > 12) {
    return ['signal storm expected; triage before action'];
  }
  if (signalCount > 5) {
    return ['elevated alert volume'];
  }
  return ['signal envelope stable'];
};

export const buildHealthMatrix = (
  plan: RecoveryPlan,
  signals: readonly CockpitSignal[] = [],
  config: MatrixConfig,
): HealthMatrix => {
  const selectedSignals = signals.slice(0, config.signalCap);
  const policyScore = scorePolicy(plan, config.policyMode);
  const forecastScore = scoreForecast(plan);
  const readinessScore = scoreReadiness(plan);
  const signalsScore = scoreSignals(plan, config.includeSignals, selectedSignals);
  const riskForecast = buildRiskForecast(plan, config.policyMode, selectedSignals);

  const cells: HealthCell[] = [
    {
      planId: plan.planId,
      axis: 'policy',
      bucket: bucket(policyScore),
      score: policyScore,
      notes: noteForPolicy(policyScore, plan.actions.length),
    },
    {
      planId: plan.planId,
      axis: 'forecast',
      bucket: bucket(forecastScore),
      score: forecastScore,
      notes: noteForForecast(forecastScore, plan.actions.length),
    },
    {
      planId: plan.planId,
      axis: 'readiness',
      bucket: bucket(readinessScore),
      score: readinessScore,
      notes: noteForReadiness(readinessScore, plan.actions.length),
    },
    {
      planId: plan.planId,
      axis: 'signal',
      bucket: bucket(signalsScore),
      score: signalsScore,
      notes: noteForSignals(selectedSignals.length),
    },
  ];

  const actionProfile = actionCounts(plan.actions);
  const matrixScore = Number(((policyScore + forecastScore + readinessScore + signalsScore) / 4).toFixed(2));
  const severityBand = bandFor(matrixScore);
  const summary = `${plan.labels.short} policy=${policyScore.toFixed(1)} forecast=${forecastScore.toFixed(1)} readiness=${readinessScore.toFixed(1)} signals=${signalsScore.toFixed(1)} critical=${riskForecast.peakRisk.toFixed(1)} criticalNodes=${actionProfile.critical};drain=${actionProfile.drained};long=${actionProfile.long}`;

  return {
    generatedAt: new Date().toISOString() as UtcIsoTimestamp,
    planId: plan.planId,
    cells,
    severityBand,
    score: matrixScore,
    summary,
  };
};

export const summarizeMatrix = (matrix: HealthMatrix): string =>
  `${matrix.planId} ${matrix.severityBand} score=${matrix.score.toFixed(2)} cells=${matrix.cells.length} age=${matrix.generatedAt}`;

export const matrixForWorkspace = (
  plans: readonly RecoveryPlan[],
  plansSignals: ReadonlyMap<RecoveryPlan['planId'], readonly CockpitSignal[]>,
  mode: MatrixConfig,
): readonly HealthMatrix[] =>
  plans.map((plan) => buildHealthMatrix(plan, plansSignals.get(plan.planId) ?? [], mode));

export const rankedMatrices = (matrices: readonly HealthMatrix[]): readonly HealthMatrix[] =>
  [...matrices].sort((left, right) => {
    if (left.severityBand === right.severityBand) {
      return right.score - left.score;
    }
    const weights: Record<HealthMatrix['severityBand'], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return weights[right.severityBand] - weights[left.severityBand];
  });
