import type { ReadinessDirective, ReadinessSignal, ReadinessTarget, RecoveryReadinessPlan } from './types';
import type { ReadinessPolicy } from './policy';
import { detectAnomalies, aggregateReadinessSignalWindow } from './forecast-profile';
import { toRuntimeSchedule, type RuntimeSchedule, rankSchedules } from './runtime-schedule';
import { evaluateContractCompliance } from './sla-contract';
import { buildSignalMatrix, criticalityScoreByTarget } from './signal-matrix';
import { foldSignals } from './signals';

export type StrategyIntent = 'aggressive' | 'balanced' | 'defensive';
export type StrategyGrade = 'A' | 'B' | 'C' | 'D';

export interface ReadinessRunSnapshot {
  plan: RecoveryReadinessPlan;
  targets: readonly ReadinessTarget[];
  signals: readonly ReadinessSignal[];
  directives: readonly ReadinessDirective[];
}

export interface StrategyProjection {
  runId: string;
  trend: 'improving' | 'stable' | 'degrading';
  score: number;
  confidence: number;
}

export interface StrategyBundle {
  runId: string;
  intent: StrategyIntent;
  grade: StrategyGrade;
  score: number;
  rationale: readonly string[];
  schedule: RuntimeSchedule;
  projections: readonly StrategyProjection[];
}

export function projectReadinessStrategies(
  models: readonly ReadinessRunSnapshot[],
  policy: ReadinessPolicy,
): readonly StrategyBundle[] {
  return models.map((model) => analyzeReadinessRun(model, policy));
}

export function compareStrategies(left: StrategyBundle, right: StrategyBundle): StrategyBundle {
  if (left.score === right.score) {
    return left.rationale.length >= right.rationale.length ? left : right;
  }
  return left.score > right.score ? left : right;
}

function analyzeReadinessRun(model: ReadinessRunSnapshot, policy: ReadinessPolicy): StrategyBundle {
  const schedule = toRuntimeSchedule({
    plan: model.plan,
    targets: model.targets,
    signals: model.signals,
    directives: model.directives,
    revision: 0,
    updatedAt: new Date().toISOString(),
  });

  const intent = pickIntent(model, policy);
  const windows = aggregateReadinessSignalWindow(
    model.signals.map((signal) => ({ ts: signal.capturedAt, value: signal.signalId.length })),
  );
  const projections = buildProjections(model, windows);
  const compliance = evaluateContractCompliance({
    runId: model.plan.runId,
    plan: model.plan,
    signals: model.signals,
    directives: model.directives,
    targets: model.targets,
    policy,
  });
  const anomalies = detectAnomalies({
    policy,
    model: {
      runId: model.plan.runId,
      plan: {
        planId: model.plan.planId,
        runId: model.plan.runId,
        riskBand: model.plan.riskBand,
        targets: model.targets,
        windows: model.plan.windows,
        signals: model.signals,
        metadata: model.plan.metadata,
      },
      signals: model.signals,
      targets: model.targets,
      directives: model.directives,
      revision: 0,
      updatedAt: model.plan.createdAt,
    },
  }).length;

  const rationale = [
    `intent:${intent}`,
    `risk:${model.plan.riskBand}`,
    `compliance:${compliance.compliant}`,
    `anomalies:${anomalies}`,
    `windows:${schedule.windows.length}`,
  ];

  return {
    runId: model.plan.runId,
    intent,
    grade: toGrade(compliance.score),
    score: Number((compliance.score - anomalies * 2).toFixed(2)),
    rationale,
    schedule: rankSchedules([schedule])[0] ?? schedule,
    projections,
  };
}

function buildProjections(model: ReadinessRunSnapshot, windows: readonly { ts: string; value: number }[]): readonly StrategyProjection[] {
  const matrix = buildSignalMatrix(model.signals);
  const trend: StrategyProjection['trend'] =
    foldSignals(model.signals).riskBand === 'red' ? 'degrading' : model.signals.length > 0 ? 'improving' : 'stable';
  const criticality = criticalityByPlan(model);
  const confidence = Number(Math.max(0, Math.min(1, 0.4 + matrix.totalSignals * 0.02)).toFixed(2));
  const score = Number((criticality * 1.4 + matrix.totalSignals).toFixed(2));

  return [
    {
      runId: model.plan.runId,
      trend,
      score,
      confidence,
    },
    {
      runId: model.plan.runId,
      trend: 'stable',
      score,
      confidence: Number((confidence * 0.75).toFixed(2)),
    },
    {
      runId: model.plan.runId,
      trend: windows.length > 4 ? 'improving' : 'degrading',
      score: windows.length > 0 ? Math.max(0, score - Math.min(10, windows.length)) : score,
      confidence: Number((confidence * 0.9).toFixed(2)),
    },
  ];
}

function pickIntent(model: ReadinessRunSnapshot, policy: ReadinessPolicy): StrategyIntent {
  if (!policy.constraints.forbidParallelity && model.signals.length > 20) {
    return 'aggressive';
  }
  if (model.targets.length > 5 || model.directives.length > 10) {
    return 'defensive';
  }
  return 'balanced';
}

function criticalityByPlan(model: ReadinessRunSnapshot): number {
  return Array.from(criticalityScoreByTarget(model.signals).values()).reduce((sum, value) => sum + value, 0);
}

function toGrade(score: number): StrategyGrade {
  if (score >= 90) {
    return 'A';
  }
  if (score >= 70) {
    return 'B';
  }
  if (score >= 50) {
    return 'C';
  }
  return 'D';
}
