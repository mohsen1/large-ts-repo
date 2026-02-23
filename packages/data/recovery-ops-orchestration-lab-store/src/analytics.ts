import type { LabStoreSnapshot, LabRunRecord, OrchestrationLabEnvelope, StoreSummary } from './model';
import type { LabQueryFilter } from './model';
import { queryLabs } from './query';

export interface LabDashboardSignal {
  readonly id: string;
  readonly score: number;
  readonly tier: string;
}

export interface LabDashboardSummary {
  readonly id: string;
  readonly totalSignals: number;
  readonly criticalSignals: number;
}

export interface LabAnalytics {
  readonly totalLabs: number;
  readonly criticalPlanCoverage: number;
  readonly avgRunsPerLab: number;
  readonly topTenant: string;
  readonly latestRunAt: string | undefined;
}

interface ScalarSignal {
  readonly id: string;
  readonly score: number;
  readonly tier: string;
}

interface SeriesRun {
  readonly runId: string;
  readonly startedAt: string;
  readonly status: string;
}

const toEnvelope = (lab: LabStoreSnapshot['labs'][number]): OrchestrationLabEnvelope => ({
  id: `env:${lab.id}` as OrchestrationLabEnvelope['id'],
  state: 'draft',
  lab,
  intent: {
    tenantId: lab.tenantId,
    siteId: 'default',
    urgency: 'normal',
    rationale: 'dashboard',
    owner: lab.tenantId,
    requestedAt: new Date().toISOString(),
    tags: ['aggregate'],
  },
  plans: lab.plans,
  windows: lab.windows,
  metadata: {},
  revision: 0,
});

export const summarizeStore = (envelopes: readonly OrchestrationLabEnvelope[], runs: readonly LabRunRecord[]): StoreSummary => {
  const selected = envelopes.filter((entry) => entry.plans.length > 0).length;
  return {
    totalLabs: envelopes.length,
    totalRuns: runs.length,
    selectedPlanCount: selected,
    lastUpdated: new Date().toISOString(),
  };
};

export const computeAnalytics = (envelopes: readonly OrchestrationLabEnvelope[], runs: readonly LabRunRecord[]): LabAnalytics => {
  const summary = summarizeStore(envelopes, runs);
  const tenantHistogram = new Map<string, number>();

  for (const envelope of envelopes) {
    tenantHistogram.set(envelope.lab.tenantId, (tenantHistogram.get(envelope.lab.tenantId) ?? 0) + 1);
  }

  let topTenant = 'none';
  let topValue = 0;
  for (const [tenant, count] of tenantHistogram.entries()) {
    if (count > topValue) {
      topTenant = tenant;
      topValue = count;
    }
  }

  const latest = [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  const criticals = queryLabs(envelopes, { signalTier: 'critical', pageSize: 1000 }).data.length;

  return {
    totalLabs: summary.totalLabs,
    criticalPlanCoverage: summary.totalLabs === 0 ? 0 : Number(((criticals / summary.totalLabs) * 100).toFixed(2)),
    avgRunsPerLab: summary.totalLabs === 0 ? 0 : Number((summary.totalRuns / summary.totalLabs).toFixed(3)),
    topTenant,
    latestRunAt: latest?.startedAt,
  };
};

export const aggregateSnapshot = (snapshot: LabStoreSnapshot): LabAnalytics => {
  const envelopes = snapshot.labs.map((lab) => toEnvelope(lab));
  return computeAnalytics(envelopes, snapshot.runs);
};

export const rankSignals = (lab: { readonly signals: ReadonlyArray<ScalarSignal> }): ReadonlyArray<LabDashboardSignal> =>
  [...lab.signals]
    .sort((left, right) => right.score - left.score)
    .map((signal) => ({
      id: signal.id,
      score: signal.score,
      tier: signal.tier,
    }));

export const parseRunSeries = (runs: readonly LabRunRecord[]): ReadonlyArray<SeriesRun> =>
  runs.map((run) => ({
    runId: run.runId,
    startedAt: run.startedAt,
    status: run.status,
  }));

export const buildDashboardSummary = (snapshot: LabStoreSnapshot, filter: LabQueryFilter): LabDashboardSummary[] => {
  const envelopes = snapshot.labs.map((lab) => {
    const envelope: OrchestrationLabEnvelope = {
      id: `env:${lab.id}` as OrchestrationLabEnvelope['id'],
      state: 'draft',
      lab,
      intent: {
        tenantId: lab.tenantId,
        siteId: 'default',
        urgency: 'normal',
        rationale: 'dashboard',
        owner: lab.tenantId,
        requestedAt: new Date().toISOString(),
        tags: [],
      },
      plans: lab.plans,
      windows: lab.windows,
      metadata: {},
      revision: 0,
    };

    return envelope;
  });

  const queryResult = queryLabs(envelopes, filter);
  return queryResult.data.map((envelope) => ({
    id: String(envelope.lab.id),
    totalSignals: envelope.lab.signals.length,
    criticalSignals: envelope.lab.signals.filter((signal) => signal.tier === 'critical').length,
  }));
};
