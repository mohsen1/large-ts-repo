import { withBrand } from '@shared/core';
import { z } from 'zod';
import type { RecoveryRiskSignal, RecoveryRiskSignal as SignalEnvelope } from '@domain/recovery-operations-intelligence';
import type { RecoverySignal, RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

interface RawSignalEnvelope {
  readonly tenant: string;
  readonly runId: string;
  readonly source: string;
  readonly observedAt?: string;
  readonly signal: RecoverySignal;
  readonly metadata?: Record<string, unknown>;
}

const signalEnvelopeSchema = z.object({
  tenant: z.string().min(1),
  runId: z.string().min(1),
  source: z.string().min(1),
  observedAt: z.string().datetime().optional(),
  signal: z.object({
    id: z.string().min(1),
    source: z.string().min(1),
    severity: z.number().min(1).max(10),
    confidence: z.number().min(0).max(1),
    detectedAt: z.string().datetime(),
    details: z.record(z.unknown()),
  }),
  metadata: z.record(z.unknown()).optional(),
});

const normalizeObservedAt = (value: string | undefined): string =>
  value ?? new Date().toISOString();

export interface SignalBatch {
  readonly tenant: string;
  readonly runId: string;
  readonly signals: readonly RecoveryRiskSignal[];
  readonly metadata: Record<string, unknown>;
  readonly dedupeKey: string;
}

export interface SignalPartition {
  readonly tenant: string;
  readonly partitionId: string;
  readonly buckets: readonly { bucket: string; count: number }[];
  readonly enrichedSignals: readonly RecoveryRiskSignal[];
}

const parseEnvelope = (input: unknown): RawSignalEnvelope => signalEnvelopeSchema.parse(input);

const buildSignal = (tenant: string, runId: string, source: string, signal: RecoverySignal): RecoveryRiskSignal => ({
  runId: withBrand(runId, 'IntelligenceRunId'),
  envelopeId: `${tenant}-${runId}-${signal.id}`,
  source: source as RecoveryRiskSignal['source'],
  signal,
  window: {
    tenant: withBrand(tenant, 'TenantId'),
    from: new Date(Date.now() - 60_000).toISOString(),
    to: new Date().toISOString(),
    zone: 'UTC',
  },
  tags: [source, signal.source],
});

export const parseRawSignal = (payload: unknown): SignalBatch => {
  const parsed = parseEnvelope(payload);
  const window = normalizeObservedAt(parsed.observedAt);
  const signal = {
    ...parsed.signal,
    detectedAt: window,
  };

  return {
    tenant: parsed.tenant,
    runId: parsed.runId,
    signals: [buildSignal(parsed.tenant, parsed.runId, parsed.source, signal)],
    metadata: parsed.metadata ?? {},
    dedupeKey: `${parsed.tenant}:${parsed.runId}:${signal.id}`,
  };
};

export const parseRawSignals = (payloads: readonly unknown[]): SignalBatch[] =>
  payloads.map((payload) => parseRawSignal(payload));

export const normalizeSignals = (batch: SignalBatch): SignalBatch => {
  const uniqueSignals = batch.signals.filter((item, index, array) => {
    const firstIndex = array.findIndex((other) => other.envelopeId === item.envelopeId);
    return firstIndex === index;
  });

  return {
    ...batch,
    signals: uniqueSignals,
  };
};

export const enrichSignals = (
  batch: SignalBatch,
  plan: RunPlanSnapshot,
  readiness: RecoveryReadinessPlan,
): SignalBatch => {
  const riskBand = readiness.riskBand === 'red' ? 'red' : readiness.riskBand ?? 'green';
  const tags = new Set<string>([riskBand, plan.fingerprint.serviceFamily]);
  const enriched = batch.signals.map((signal, index) => ({
    ...signal,
    tags: [...signal.tags, ...Array.from(tags), `index:${index}`],
    window: {
      ...signal.window,
      zone: readiness.windows?.[0]?.timezone ?? signal.window.zone,
    },
  }));
  return {
    ...batch,
    signals: enriched,
  };
};

export const partitionByTenant = (batches: readonly SignalBatch[]): readonly SignalPartition[] => {
  const grouped = new Map<string, SignalBatch[]>();
  for (const batch of batches) {
    const next = grouped.get(batch.tenant) ?? [];
    grouped.set(batch.tenant, [...next, batch]);
  }

  const partitions: SignalPartition[] = [];
  for (const [tenant, tenantBatches] of grouped) {
    const buckets = new Map<string, number>();
    const flattened = tenantBatches.flatMap((batch) => batch.signals);
    for (const signal of flattened) {
      for (const tag of signal.tags) {
        const current = buckets.get(tag) ?? 0;
        buckets.set(tag, current + 1);
      }
    }
    partitions.push({
      tenant,
      partitionId: `${tenant}-${tenantBatches.length}`,
      buckets: Array.from(buckets.entries()).map(([bucket, count]) => ({ bucket, count })),
      enrichedSignals: flattened,
    });
  }

  return partitions;
};

export const summarizePartitions = (partitions: readonly SignalPartition[]): string[] => {
  return partitions.map((item) =>
    `${item.tenant}:${item.partitionId}:${item.enrichedSignals.length}:${item.buckets.length}`,
  );
};
