import type { ReadinessReadModel, SignalFilter, RunIndex } from './models';
import type { ReadinessSignal } from '@domain/recovery-readiness';
import { filterBySignalCriteria, summarizeByOwner, sortByRiskBand } from './queries';
import { buildReadinessDigest, buildWindowDigest, buildSignalDensityTimeline } from './read-model-extensions';

export interface SearchFacet {
  key: string;
  count: number;
}

export interface SearchResult {
  runs: readonly ReadinessReadModel[];
  metrics: {
    total: number;
    totalSignals: number;
  };
  facets: {
    owners: readonly SearchFacet[];
    sources: readonly SearchFacet[];
  };
}

export interface QuerySurface {
  tenant?: string;
  source?: ReadinessSignal['source'];
  maxPerOwner?: number;
}

interface SearchState {
  byOwner: Record<string, number>;
  bySource: Record<ReadinessSignal['source'], number>;
}

export function searchReadinessModels(
  models: readonly ReadinessReadModel[],
  filter: SignalFilter,
  surface: QuerySurface = {},
): SearchResult {
  const filtered = filterBySignalCriteria(models, filter);
  const withTenant = filterByOwner(filtered, surface.tenant);
  const ordered = sortByRiskBand([...withTenant]);

  const state = buildState(ordered);
  const limited = ordered.slice(0, Math.max(1, surface.maxPerOwner ?? ordered.length));

  return {
    runs: limited,
    metrics: {
      total: limited.length,
      totalSignals: limited.reduce((sum, run) => sum + run.signals.length, 0),
    },
    facets: {
      owners: Object.entries(state.byOwner).map(([key, count]) => ({ key, count })),
      sources: Object.entries(state.bySource).map(([key, count]) => ({ key, count })),
    },
  };
}

export function buildRunIndexes(models: readonly ReadinessReadModel[]): readonly RunIndex[] {
  return models.map((model) => ({
    runId: model.plan.runId,
    planId: model.plan.planId,
    state: model.plan.state,
    riskBand: model.plan.riskBand,
    owner: model.plan.metadata.owner,
    tags: model.plan.metadata.tags,
  }));
}

export function buildSourceDistribution(models: readonly ReadinessReadModel[]): Record<ReadinessSignal['source'], number> {
  const initial: Record<ReadinessSignal['source'], number> = { telemetry: 0, synthetic: 0, 'manual-check': 0 };
  for (const model of models) {
    for (const signal of model.signals) {
      initial[signal.source] += 1;
    }
  }
  return initial;
}

export function buildRunSignalTimeline(models: readonly ReadinessReadModel[]): ReadonlyArray<{ at: string; runId: string; events: number; total: number }> {
  const timeline = buildSignalDensityTimeline(models);
  return timeline.map((point, index) => ({
    at: point.at,
    runId: point.runId,
    events: point.signals,
    total: point.directives * (index + 1),
  }));
}

export function summarizeForQuery(models: readonly ReadinessReadModel[]): {
  digest: ReturnType<typeof buildReadinessDigest>;
  windows: ReturnType<typeof buildWindowDigest>;
  density: ReturnType<typeof buildSignalDensityTimeline>;
  indexes: ReturnType<typeof buildRunIndexes>;
} {
  return {
    digest: buildReadinessDigest(models),
    windows: buildWindowDigest(models),
    density: buildSignalDensityTimeline(models),
    indexes: buildRunIndexes(models),
  };
}

export function summarizeReadinessStore(models: readonly ReadinessReadModel[]) {
  return summarizeForQuery(models);
}

function filterByOwner(models: readonly ReadinessReadModel[], tenant?: string): readonly ReadinessReadModel[] {
  if (!tenant) {
    return models;
  }
  return models.filter((model) => model.plan.metadata.owner.includes(tenant));
}

function buildState(models: readonly ReadinessReadModel[]): SearchState {
  const byOwner = summarizeByOwner(models);
  const bySource = { telemetry: 0, synthetic: 0, 'manual-check': 0 } as Record<ReadinessSignal['source'], number>;
  for (const model of models) {
    for (const signal of model.signals) {
      bySource[signal.source] += 1;
    }
  }
  return {
    byOwner: Object.fromEntries(Array.from(byOwner.entries())) as Record<string, number>,
    bySource,
  };
}
