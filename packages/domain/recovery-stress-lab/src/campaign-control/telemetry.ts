import {
  buildCampaignTrace,
  type CampaignId,
  type CampaignPhase,
  type CampaignSessionId,
  type CampaignSeed,
  type CampaignTraceEvent,
  createCampaignId,
  createCampaignSessionId,
} from './types';
import { type RecoverySignal, type TenantId } from '../models';

interface CampaignTelemetryEnvelope<T> {
  readonly tenantId: TenantId;
  readonly sessionId: CampaignSessionId;
  readonly payload: T;
}

type IteratorFrom = {
  from?<T>(value: Iterable<T>): { map<U>(transform: (value: T) => U): { toArray(): U[] } };
};

const iteratorFrom = (globalThis as { readonly Iterator?: IteratorFrom }).Iterator?.from;

const toIteratorArray = <T>(source: Iterable<T>): readonly T[] => {
  if (!iteratorFrom) {
    return [...source];
  }

  return iteratorFrom(source).map((entry) => entry as T).toArray();
};

export interface CampaignTelemetryChunk {
  readonly name: string;
  readonly values: readonly number[];
  readonly createdAt: string;
}

export interface CampaignTelemetrySnapshot {
  readonly tenantId: TenantId;
  readonly trace: CampaignTraceEvent;
  readonly chunks: readonly CampaignTelemetryChunk[];
}

const rankSignals = (signal: RecoverySignal): number => {
  return signal.title.length + Object.keys(signal.metadata ?? {}).length + String(signal.id).length;
};

export const collectCampaignTelemetryChunks = async function* (
  tenantId: TenantId,
  signals: readonly RecoverySignal[],
): AsyncGenerator<CampaignTelemetryChunk> {
  for (const signal of toIteratorArray(signals)) {
    yield {
      name: `signal:${String(signal.id)}`,
      values: [signal.title.length, rankSignals(signal), signal.id.length],
      createdAt: new Date().toISOString(),
    };
    await Promise.resolve();
  }

  const summary = signals.length;
  yield {
    name: `tenant:${String(tenantId)}`,
    values: [summary, summary ** 2],
    createdAt: new Date().toISOString(),
  };
};

export const collectCampaignChunks = async (
  tenantId: TenantId,
  signals: readonly RecoverySignal[],
): Promise<readonly CampaignTelemetryChunk[]> => {
  const chunks: CampaignTelemetryChunk[] = [];
  for await (const chunk of collectCampaignTelemetryChunks(tenantId, signals)) {
    chunks.push(chunk);
  }
  return chunks;
};

export const buildCampaignSnapshot = (
  tenantId: TenantId,
  sessionId: CampaignSessionId,
  trace: CampaignTraceEvent,
  chunks: readonly CampaignTelemetryChunk[],
): CampaignTelemetrySnapshot => ({
  tenantId,
  trace,
  chunks: [...chunks],
});

export const buildTraceEnvelope = (tenantId: TenantId, campaignId: string): CampaignTelemetryEnvelope<CampaignTraceEvent> => {
  const brandCampaign = createCampaignId(tenantId, campaignId);
  return {
    tenantId,
    sessionId: createCampaignSessionId(tenantId, brandCampaign),
    payload: buildCampaignTrace(tenantId, brandCampaign),
  };
};

export const summarizeTelemetry = (chunks: readonly CampaignTelemetryChunk[]): Readonly<Record<string, number>> => {
  const summary: Record<string, number> = {};
  for (const chunk of chunks) {
    summary[chunk.name] = chunk.values.reduce((left, right) => left + right, 0);
  }
  return summary;
};

export const phaseHeat = (phases: readonly CampaignPhase[]): readonly CampaignPhase[] => {
  const ordered = {
    seed: 1,
    discovery: 2,
    modeling: 3,
    orchestration: 4,
    simulation: 5,
    verification: 6,
    review: 7,
  } as const;

  return [...phases].toSorted((left, right) => ordered[right] - ordered[left]);
};

export type CampaignRouteSignature = readonly [string, ...string[]];

export const planRouteFromSeed = (seed: CampaignSeed): CampaignRouteSignature => {
  const first = seed.requiredSignals[0] ?? 'none';
  return ['seed', ...seed.labels.slice(0, 1), String(first)] as CampaignRouteSignature;
};
