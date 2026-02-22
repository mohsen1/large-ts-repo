import type { ReadinessReadModel, ReadinessRepositoryMetrics, ReadinessWindowDigest } from './models';
import type { ReadinessRunId } from '@domain/recovery-readiness';
import { topSignalsByRun } from './query-extensions';
import { summarizeByOwner, filterBySignalCriteria } from './queries';
import { calculateWindowDensity, type TimeWindow } from '@domain/recovery-readiness';
import { readModelHealths } from './analytics';

export interface ReadinessPortfolio {
  total: number;
  byOwner: ReadonlyMap<string, number>;
  bySignalDensity: readonly { runId: string; density: number }[];
  atRiskRunIds: readonly string[];
}

export interface ReadinessWindowDigestResult {
  runId: string;
  startUtc: string;
  endUtc: string;
  windowIndex: number;
  directiveSignalRatio: number;
}

export interface ReadinessDigest {
  total: number;
  topRunId: string | undefined;
  totalSignals: number;
  recentSignals: readonly string[];
}

export interface ReadinessWindowDigestRow {
  runId: string;
  windowIndex: number;
  directiveSignalRatio: number;
  directives: number;
  signals: number;
}

export interface ReadinessSignalDensityPoint {
  at: string;
  runId: ReadinessRunId;
  signals: number;
  directives: number;
}

export function buildReadinessPortfolio(models: readonly ReadinessReadModel[]): ReadinessPortfolio {
  const byOwner = summarizeByOwner(models);
  const tenantSignals = filterBySignalCriteria([...models], {});
  const windowDensity = summarizeWindowSignals(tenantSignals);
  const tenantSignalsAsWindow: ReadinessWindowDigest[] = tenantSignals
    .map((model) => ({
      runId: model.plan.runId,
      windowIndex: windowDensity.find((density) => density.runId === model.plan.runId)?.windowIndex ?? 0,
      activeDirectives: model.directives.length,
      criticality: model.signals.length,
      riskBand: model.plan.riskBand,
    }))
    .filter((entry) => entry.runId.length > 0);
  const bySignalDensity = tenantSignalsAsWindow.map((entry) => ({
    runId: entry.runId,
    density: entry.criticality / Math.max(1, entry.activeDirectives || 1),
  }));

  const scoreMap = new Map<string, number>(readModelHealths(models).map((health) => [health.runId, health.score]));
  const weightedDensity = bySignalDensity
    .map((entry) => ({
      ...entry,
      density: entry.density * (scoreMap.get(entry.runId) ?? 1),
    }))
    .sort((left, right) => right.density - left.density);

  return {
    total: models.length,
    byOwner,
    bySignalDensity: weightedDensity,
    atRiskRunIds: weightedDensity.filter((entry) => entry.density > 4).map((entry) => entry.runId),
  };
}

export function summarizeModelWindows(models: readonly ReadinessReadModel[]): readonly ReadinessWindowDigestResult[] {
  const out: ReadinessWindowDigestResult[] = [];
  for (const model of models) {
    const windows = model.plan.windows.map((window) => ({
      owner: window.label,
      startUtc: window.fromUtc,
      endUtc: window.toUtc,
      capacity: Math.max(1, window.label.length + 1),
    }));
    const density = calculateWindowDensity(windows);

    model.plan.windows.forEach((window, index) => {
      out.push({
        runId: model.plan.runId,
        startUtc: window.fromUtc,
        endUtc: window.toUtc,
        windowIndex: index,
        directiveSignalRatio: density,
      });
    });
  }
  return out;
}

export function buildTenantSignals(models: readonly ReadinessReadModel[], tenant: string): {
  tenant: string;
  runIds: readonly string[];
  topSignals: readonly ReadinessReadModel[];
} {
  const filtered = filterBySignalCriteria(models, { planState: 'active' }).filter((model) => model.plan.metadata.owner === tenant);
  const runIds = filtered.map((model) => model.plan.runId);
  const topSignals = runIds.map((runId) => filtered.find((model) => model.plan.runId === runId)).filter((entry): entry is ReadinessReadModel => entry != null);

  return { tenant, runIds, topSignals };
}

export interface ReadinessModelEnrichment {
  readonly runId: string;
  readonly score: number;
  readonly warnings: number;
}

export function enrichReadModels(models: readonly ReadinessReadModel[]): readonly ReadinessModelEnrichment[] {
  return readModelHealths(models).map((health) => ({
    runId: health.runId,
    score: health.score,
    warnings: health.directiveCount,
  }));
}

export function buildDigestByWindow(models: readonly ReadinessReadModel[]): readonly ReadinessWindowDigest[] {
  const digest: ReadinessWindowDigest[] = [];
  for (const model of models) {
    model.plan.windows.forEach((window, index) => {
      digest.push({
        runId: model.plan.runId,
        windowIndex: index,
        activeDirectives: model.directives.length,
        criticality: model.signals.length,
        riskBand: model.plan.riskBand,
      });
    });
  }
  return digest;
}

export function buildSignalsDistribution(models: readonly ReadinessReadModel[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const model of models) {
    const map = topSignalsByRun(models, model.plan.runId);
    output[model.plan.runId] = map.length;
  }
  return output;
}

export function filterByDensity(models: readonly ReadinessReadModel[], minDensity: number): readonly ReadinessReadModel[] {
  return models.filter((model) => {
    const active = model.plan.targets.length > 0 ? model.signals.length / model.plan.targets.length : 0;
    return active >= minDensity;
  });
}

export function buildWindowByOwner(models: readonly ReadinessReadModel[]): ReadonlyMap<string, Readonly<TimeWindow[]>> {
  const owners = new Map<string, TimeWindow[]>();
  for (const model of models) {
    const list = owners.get(model.plan.metadata.owner) ?? [];
    const windows = model.plan.windows.map((window) => ({
      owner: window.label,
      startUtc: window.fromUtc,
      endUtc: window.toUtc,
      capacity: Math.max(1, window.label.length),
    }));
    owners.set(model.plan.metadata.owner, [...list, ...windows]);
  }
  return owners;
}

export function buildReadinessDigest(models: readonly ReadinessReadModel[]): ReadinessDigest {
  return {
    total: models.length,
    topRunId: models[0]?.plan.runId,
    totalSignals: models.reduce((sum, model) => sum + model.signals.length, 0),
    recentSignals: models.flatMap((model) => model.signals.slice(-2).map((signal) => `${model.plan.runId}:${signal.signalId}`)),
  };
}

export function buildWindowDigest(models: readonly ReadinessReadModel[]): readonly ReadinessWindowDigest[] {
  return buildDigestByWindow(models);
}

export function buildSignalDensityTimeline(models: readonly ReadinessReadModel[]): readonly ReadinessSignalDensityPoint[] {
  return models.flatMap((model) =>
    model.signals.map((signal, index) => ({
      at: signal.capturedAt,
      runId: signal.runId,
      signals: index + 1,
      directives: model.directives.length,
    })),
  );
}

export function buildReadinessMetricsSnapshot(models: readonly ReadinessReadModel[]): ReadinessRepositoryMetrics {
  return {
    totalTracked: models.length,
    activeSignals: models.reduce((sum, model) => sum + model.signals.length, 0),
    activeRuns: models.filter((model) => model.plan.state === 'active').length,
    snapshots: Math.max(1, models.length),
  };
}

function summarizeWindowSignals(models: readonly ReadinessReadModel[]): readonly ReadinessWindowDigest[] {
  return models.flatMap((model) =>
    model.plan.windows.map((window, windowIndex) => ({
      runId: model.plan.runId,
      windowIndex,
      activeDirectives: model.directives.length,
      criticality: model.signals.length / Math.max(1, windowIndex + 1),
      riskBand: model.plan.riskBand,
    })),
  );
}
