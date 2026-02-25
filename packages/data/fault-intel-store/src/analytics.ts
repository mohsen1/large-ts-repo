import type { IncidentSignal, Transport } from '@domain/fault-intel-orchestration';
import { createIteratorChain, collectUnique } from '@shared/fault-intel-runtime';
import { createFaultIntelStore, type CampaignStoreQuery, type CampaignStoreSummary } from './repository';

const store = createFaultIntelStore();

export interface ChannelLoad {
  readonly transport: Transport;
  intensity: number;
  readonly examples: readonly string[];
}

export interface HealthForecast {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly load: readonly ChannelLoad[];
  readonly riskTrend: 'up' | 'down' | 'flat';
  readonly summary: CampaignStoreSummary;
}

export const computeChannelLoad = (signals: readonly IncidentSignal[]): readonly ChannelLoad[] => {
  const grouped = createIteratorChain(signals)
    .filter((signal) => signal.signalId.length > 0)
    .toArray();
  const tally = new Map<string, { transport: Transport; intensity: number; examples: string[] }>();

  for (const signal of grouped) {
    const existing = tally.get(signal.transport) ?? {
      transport: signal.transport,
      intensity: 0,
      examples: [],
    };
    existing.intensity += signal.metrics.length;
    existing.examples.push(signal.title);
    tally.set(signal.transport, existing);
  }

  return [...tally.values()];
};

export const collectTransportMatrix = (signals: readonly IncidentSignal[]): Readonly<Record<Transport, readonly string[]>> => {
  const matrix: Record<Transport, string[]> = {
    mesh: [],
    fabric: [],
    cockpit: [],
    orchestration: [],
    console: [],
  };

  for (const signal of signals) {
    const current = matrix[signal.transport] ?? [];
    matrix[signal.transport] = [...current, signal.signalId];
  }

  return matrix;
};

export const readCampaignSummary = async (
  tenantId: string,
  workspaceId: string,
): Promise<HealthForecast> => {
  const summary = await store.summarize(tenantId as never, workspaceId as never);
  const runs = await store.listRuns(tenantId as never, workspaceId as never, {} as CampaignStoreQuery);
  const signals = runs.flatMap((run) => run.plan.signals);
  const sorted = createIteratorChain(signals).toArray().sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const load = computeChannelLoad(sorted);
  const totals = createIteratorChain(sorted).map((signal) => signal.metrics.length).toArray();
  const previous = sorted.length === 0 ? 0 : totals.reduce((acc, value) => acc + value, 0) / sorted.length;
  const latest = createIteratorChain(sorted).first?.metrics.length ?? 0;
  const riskTrend = latest > previous ? 'up' : latest < previous ? 'down' : 'flat';

  return {
    tenantId,
    workspaceId,
    load,
    riskTrend,
    summary,
  };
};

export const topSignalsByTransport = (signals: readonly IncidentSignal[]): readonly IncidentSignal[] => {
  const ranked = [...computeChannelLoad(signals)].sort((left, right) => right.intensity - left.intensity);
  const matrix = collectTransportMatrix(signals);
  const ids = collectUnique(
    ranked.flatMap((entry) => matrix[entry.transport] ?? []),
  );
  return ids
    .map((signalId) => signals.find((signal) => signal.signalId === signalId))
    .filter((signal): signal is IncidentSignal => signal !== undefined);
};
