import type { PlaybookLabSignal, PlaybookLabRunId, PlaybookLabCampaignId, PlaybookLabTelemetryPoint } from './types';
import { withBrand } from '@shared/core';

export const buildSignal = (seed: { tenant: string; channel: PlaybookLabSignal['channel']; score: number }): PlaybookLabSignal => {
  return {
    channel: seed.channel,
    tenant: withBrand(seed.tenant, 'TenantId'),
    value: Math.max(0, Math.min(100, seed.score)),
    detail: `${seed.channel}-signal:${seed.score.toFixed(1)}`,
    observedAt: new Date().toISOString(),
  };
};

export const buildSignalBatch = (
  tenant: string,
  campaignId: PlaybookLabCampaignId,
  runId: PlaybookLabRunId,
  count: number,
): readonly PlaybookLabTelemetryPoint[] => {
  const channels: PlaybookLabSignal['channel'][] = ['ops', 'risk', 'finance', 'governance'];
  const baseline = runId.split(':').length;
  return Array.from({ length: Math.max(1, count) }).map((_, index) => {
    const channel = channels[index % channels.length];
    const score = (100 - (index * 5)) / Math.max(1, baseline + 1);
    const signal = buildSignal({ tenant, channel, score });
    return {
      runId: runId,
      at: signal.observedAt,
      campaignId,
      score: signal.value,
      latencyBudgetMs: 120 + (index * 20),
      lane: channel === 'finance' ? 'compliance' : channel === 'risk' ? 'stability' : 'recovery',
      isDryRun: score >= 60,
    };
  });
};

export const reduceSignals = (signals: readonly PlaybookLabSignal[]): Record<string, number> => {
  const aggregate: Record<string, number> = {};
  for (const signal of signals) {
    aggregate[signal.channel] = (aggregate[signal.channel] ?? 0) + signal.value;
    aggregate.total = (aggregate.total ?? 0) + signal.value;
  }
  return aggregate;
};
