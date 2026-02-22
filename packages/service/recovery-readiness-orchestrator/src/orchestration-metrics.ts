import type { ReadinessReadModel, StoreSnapshot } from '@data/recovery-readiness-store';
import type { ReadinessReadModel as StoreReadModel } from '@data/recovery-readiness-store';
import { digestModelReadiness } from '@data/recovery-readiness-store';
import { buildIncidentStream } from '@data/recovery-readiness-store';
import { snapshotBySignals } from '@data/recovery-readiness-store';
import type { RecoveryReadinessPlan, ReadinessSignal } from '@domain/recovery-readiness';

export interface MetricWindow {
  readonly from: string;
  readonly to: string;
  readonly score: number;
}

export interface OrchestrationHealth {
  readonly totalActive: number;
  readonly totalSignals: number;
  readonly totalWarnings: number;
  readonly meanSignalDensity: number;
}

export interface StreamDigest {
  readonly streamId: string;
  readonly eventCount: number;
  readonly topRunIds: readonly ReadinessReadModel['plan']['runId'][];
}

export interface WindowDensityRanking {
  readonly runId: ReadinessReadModel['plan']['runId'];
  readonly density: number;
}

function scoreByPlan(model: ReadinessReadModel): number {
  const profile = digestModelReadiness(model);
  return profile.riskEnvelope.totalScore + profile.directiveReadiness;
}

export function readModelWindowScores(models: readonly StoreReadModel[]): readonly MetricWindow[] {
  const now = Date.now();
  const windows: MetricWindow[] = [15, 30, 60].map((minutes) => {
    const threshold = now - minutes * 60 * 1000;
    const selected = models.filter((model) => Date.parse(model.plan.createdAt) >= threshold);
    const score = selected.length
      ? selected.reduce((sum, model) => sum + scoreByPlan(model), 0) / selected.length
      : 0;
    return {
      from: new Date(threshold).toISOString(),
      to: new Date(now).toISOString(),
      score: Number(score.toFixed(2)),
    };
  });

  return windows;
}

export function summarizeOrchestratorState(models: readonly StoreReadModel[]): OrchestrationHealth {
  const active = models.filter((model) => model.plan.state === 'active');
  const signalDensity = active.length === 0 ? 0 : Number((active.reduce((sum, model) => sum + model.signals.length, 0) / active.length).toFixed(2));
  const totalWarnings = active.filter((model) => scoreByPlan(model) > 100).length;

  return {
    totalActive: active.length,
    totalSignals: active.reduce((sum, model) => sum + model.signals.length, 0),
    totalWarnings,
    meanSignalDensity: signalDensity,
  };
}

export function buildStreamDigest(models: readonly StoreReadModel[]): StreamDigest {
  const stream = buildIncidentStream(models);
  const scoreBySignals = snapshotBySignals(models);
  const ranked = Object.entries(scoreBySignals).sort((left, right) => right[1] - left[1]);

  return {
    streamId: stream.streamId,
    eventCount: stream.events.length,
    topRunIds: ranked.slice(0, 5).map(([runId]) => runId as StoreReadModel['plan']['runId']),
  };
}

export function flattenSignalsByRun(models: readonly StoreReadModel[]): readonly ReadinessSignal[] {
  return models.flatMap((model) => model.signals);
}

export function buildSnapshotFromStore(models: readonly StoreReadModel[], runCount: number): StoreSnapshot {
  const warnings = summarizeOrchestratorState(models);
  return {
    createdRuns: runCount,
    updatedRuns: models.length,
    failedWrites: warnings.totalWarnings,
    totalSignals: warnings.totalSignals,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function projectSignalDensity(model: ReadinessReadModel, cap = 3): readonly { runId: string; density: number }[] {
  const signalsByTarget = new Map<string, number>();
  for (const signal of model.signals) {
    signalsByTarget.set(signal.targetId, (signalsByTarget.get(signal.targetId) ?? 0) + 1);
  }

  return Array.from(signalsByTarget.entries())
    .map(([targetId, signalCount]) => ({
      runId: `${model.plan.runId}:${targetId}` as ReadinessReadModel['plan']['runId'],
      density: signalCount / Math.max(1, cap),
    }))
    .sort((left, right) => right.density - left.density);
}

export function rankModelsByWindowDensity(models: readonly StoreReadModel[]): readonly WindowDensityRanking[] {
  return models
    .map((model) => ({
      runId: model.plan.runId,
      density: model.plan.windows.length > 0 ? model.signals.length / model.plan.windows.length : 0,
    }))
    .sort((left, right) => right.density - left.density);
}

export function buildSignalBuckets(models: readonly RecoveryReadinessPlan[]): readonly { planId: string; points: number }[] {
  return models.map((plan) => ({
    planId: plan.planId,
    points: Math.max(1, plan.signals.length + plan.targets.length),
  }));
}
