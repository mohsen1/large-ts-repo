import { RecoveryAction, RecoveryPlan, UtcIsoTimestamp, computeReadiness, toTimestamp } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicies, PolicyMode, PolicyCheck } from './policies';
import { buildDependencyGraph, buildCriticalPath, DependencyGraph } from './dependencyGraph';
import { normalizeSignal, scoreFromSignals } from './signals';
import { CockpitSignal } from '@domain/recovery-cockpit-models';

export type ForecastBand = 'critical' | 'high' | 'moderate' | 'low';

export type RiskForecastWindow = {
  readonly at: UtcIsoTimestamp;
  readonly predictedReadiness: number;
  readonly policyExposure: number;
  readonly dependencyPressure: number;
  readonly signalPressure: number;
  readonly totalRisk: number;
  readonly band: ForecastBand;
  readonly rationale: readonly string[];
};

export type RiskForecast = {
  readonly planId: string;
  readonly generatedAt: UtcIsoTimestamp;
  readonly windows: readonly RiskForecastWindow[];
  readonly peakRisk: number;
  readonly summary: {
    readonly readiness: number;
    readonly policy: number;
    readonly dependencies: number;
    readonly signals: number;
    readonly overallRisk: number;
  };
};

const bands: Array<{ band: ForecastBand; threshold: number }> = [
  { band: 'low', threshold: 20 },
  { band: 'moderate', threshold: 45 },
  { band: 'high', threshold: 70 },
  { band: 'critical', threshold: 101 },
];

const policyRisk = (checks: readonly PolicyCheck[]): number => {
  const denied = checks.filter((check) => !check.allowed).length;
  const blocked = checks.filter((check) => !check.allowed).reduce((acc, check) => acc + (check.violations.length + 1), 0);
  return Number((denied * 12 + blocked * 5).toFixed(2));
};

const dependencyRisk = (graph: DependencyGraph, actions: readonly RecoveryAction[]): number => {
  if (actions.length === 0) {
    return 0;
  }

  const path = buildCriticalPath(graph);
  const rankValues = [...graph.rank.values()];
  const maxRank = rankValues.length === 0 ? 0 : Math.max(...rankValues);
  const criticalPathLength = path.length;
  const commandPenalty = actions.reduce((acc, action) => acc + Math.min(6, action.expectedDurationMinutes / 8), 0);
  const dependencyPenalty = criticalPathLength * 2 + maxRank * 3;

  return Number((dependencyPenalty + commandPenalty).toFixed(2));
};

const signalRisk = (signals: readonly CockpitSignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }

  const normalized = signals.map(normalizeSignal);
  const maxPenalty = 4;
  const weighted = normalized.reduce((acc, signal) => {
    if (signal.severity === 'critical') return acc + maxPenalty;
    if (signal.severity === 'warning') return acc + 3;
    if (signal.severity === 'notice') return acc + 2;
    return acc + 1;
  }, 0);

  return Number(((weighted / normalized.length) * 9.5).toFixed(2));
};

const bandFor = (value: number): ForecastBand => {
  const sorted = [...bands].sort((left, right) => left.threshold - right.threshold);
  for (const entry of sorted) {
    if (value < entry.threshold) {
      return entry.band;
    }
  }
  return 'critical';
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const forecastAt = (plan: RecoveryPlan, index: number): UtcIsoTimestamp =>
  toTimestamp(new Date(Date.now() + index * 4 * 60 * 1000));

const actionLoad = (action: RecoveryAction): number =>
  action.expectedDurationMinutes + action.retriesAllowed * 1.5 + action.dependencies.length;

const buildActionPressure = (actions: readonly RecoveryAction[]): ReadonlyArray<{ actionId: string; pressure: number }> =>
  actions
    .map((action) => ({
      actionId: action.id,
      pressure: actionLoad(action),
    }))
    .sort((left, right) => right.pressure - left.pressure);

const scoreReadiness = (plan: RecoveryPlan, pressure: number, index: number, mode: PolicyMode): number => {
  const policy = evaluatePlanPolicies(plan, mode);
  const base = plan.actions.reduce((acc, action) => acc + actionLoad(action), 0);
  const policyPenalty = policyRisk(policy);
  const pressurePenalty = pressure * 2;
  const modeBias = mode === 'enforce' ? 5 : mode === 'readonly' ? -5 : 0;
  return clamp(computeReadiness(100 - index * 2 - pressurePenalty - policyPenalty * 0.3 + modeBias, base * 0));
};

export const buildRiskForecast = (plan: RecoveryPlan, mode: PolicyMode, signals: readonly CockpitSignal[] = []): RiskForecast => {
  const graph = buildDependencyGraph(plan.actions);
  const graphRisk = dependencyRisk(graph, plan.actions);
  const policyChecks = evaluatePlanPolicies(plan, mode);
  const policyExposure = policyRisk(policyChecks);
  const signalExposure = signalRisk(signals);
  const signalWeight = scoreFromSignals(signals);
  const actionPressure = buildActionPressure(plan.actions);

  const windows: RiskForecastWindow[] = [];
  for (let index = 0; index < actionPressure.length; index += 1) {
    const pressure = actionPressure[index];
    const rationale: string[] = [
      `action=${pressure.actionId}`,
      `policy=${policyChecks.length}`,
      `checks=${policyChecks.filter((check) => check.allowed).length}`,
      `signalScore=${signalWeight}`,
    ];

    const dependencyPressure = clamp(100 - index * 3 + graphRisk - actionPressure[index]!.pressure * 2);
    const predictedReadiness = scoreReadiness(plan, pressure.pressure, index, mode);
    const policyDelta = clamp(100 - policyExposure - index * 1.2);
    const signalDelta = clamp(100 - signalExposure - index * 0.5 - Math.max(0, 100 - signalWeight));
    const totalRisk = clamp(100 - (predictedReadiness * 0.4 + policyDelta * 0.3 + signalDelta * 0.3 + dependencyPressure * 0.2));

    windows.push({
      at: forecastAt(plan, index),
      predictedReadiness,
      policyExposure,
      dependencyPressure,
      signalPressure: signalDelta,
      totalRisk,
      band: bandFor(totalRisk),
      rationale,
    });
  }

  if (windows.length === 0) {
    const reason = `plan ${plan.planId} has no actions`;
    return {
      planId: plan.planId,
      generatedAt: toTimestamp(new Date()),
      windows: [{
        at: toTimestamp(new Date()),
        predictedReadiness: 100,
        policyExposure: 0,
        dependencyPressure: 0,
        signalPressure: 0,
        totalRisk: 0,
        band: 'low',
        rationale: [reason],
      }],
      peakRisk: 0,
      summary: {
        readiness: 100,
        policy: 0,
        dependencies: 0,
        signals: 0,
        overallRisk: 0,
      },
    };
  }

  const peakRisk = Math.max(...windows.map((entry) => entry.totalRisk));
  const summary = {
    readiness: windows.reduce((acc, window) => acc + window.predictedReadiness, 0) / windows.length,
    policy: windows.reduce((acc, window) => acc + window.policyExposure, 0) / windows.length,
    dependencies: windows.reduce((acc, window) => acc + window.dependencyPressure, 0) / windows.length,
    signals: windows.reduce((acc, window) => acc + window.signalPressure, 0) / windows.length,
    overallRisk: windows.reduce((acc, window) => acc + window.totalRisk, 0) / windows.length,
  };

  return {
    planId: plan.planId,
    generatedAt: toTimestamp(new Date()),
    windows,
    peakRisk,
    summary: {
      readiness: Number(summary.readiness.toFixed(2)),
      policy: Number(summary.policy.toFixed(2)),
      dependencies: Number(summary.dependencies.toFixed(2)),
      signals: Number(summary.signals.toFixed(2)),
      overallRisk: Number(summary.overallRisk.toFixed(2)),
    },
  };
};

export const summarizeRiskForecast = (forecast: RiskForecast): string => {
  const headline = `${forecast.planId} overall=${forecast.summary.overallRisk.toFixed(1)} peak=${forecast.peakRisk.toFixed(1)}`;
  const band = bandFor(forecast.summary.overallRisk);
  const top = forecast.windows.map((window) => window.band === band).filter(Boolean).length;
  return `${headline} band=${band} windows=${forecast.windows.length} match=${top}`;
};

export const compareRiskForecasts = (left: RiskForecast, right: RiskForecast): number => {
  if (left.summary.overallRisk === right.summary.overallRisk) {
    return right.peakRisk - left.peakRisk;
  }
  return right.summary.overallRisk - left.summary.overallRisk;
};

export const isForecastCritical = (forecast: RiskForecast): boolean => forecast.summary.overallRisk > 70;

export const criticalWindows = (forecast: RiskForecast): RiskForecastWindow[] =>
  forecast.windows.filter((window) => window.band === 'critical' || window.totalRisk > 80);
