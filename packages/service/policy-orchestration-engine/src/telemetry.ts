import { emitStoreMetrics, StoreMetric, summarizeArtifacts, summarizeRuns } from '@data/policy-orchestration-store';
import { InMemoryPolicyStore } from '@data/policy-orchestration-store';

export interface TelemetryEnvelope {
  runId: string;
  metrics: StoreMetric[];
  generatedAt: string;
}

export const collectRunTelemetry = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
): Promise<TelemetryEnvelope> => {
  const artifacts = await store.searchArtifacts({ orchestratorId }, { key: 'updatedAt', order: 'desc' });
  const runs = await store.searchRuns(orchestratorId);
  const artifactSummary = summarizeArtifacts(artifacts);
  const runSummary = summarizeRuns(runs);

  const metrics = emitStoreMetrics(artifacts, runs);
  metrics.push(
    {
      name: 'summary.artifacts.total',
      value: artifactSummary.totalArtifacts,
      unit: 'count',
      dimensions: { orchestratorId },
    },
    {
      name: 'summary.runs.successRate',
      value: runSummary.runRateSuccess,
      unit: 'percent',
      dimensions: { orchestratorId },
    },
  );

  return {
    runId: `${orchestratorId}:${Date.now()}`,
    generatedAt: new Date().toISOString(),
    metrics,
  };
};

export const collectRunTelemetryByPlans = async (store: InMemoryPolicyStore, orchestratorId: string): Promise<TelemetryEnvelope> => {
  return collectRunTelemetry(store, orchestratorId);
};
