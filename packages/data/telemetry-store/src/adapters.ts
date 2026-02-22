import { createHash } from 'node:crypto';
import { MetricSample, SpanSample, AlertMatch, TelemetryEnvelope, TelemetryEventPayload, TelemetrySample } from '@domain/telemetry-models';
import { createValidator } from '@shared/validation';
import { z } from 'zod';

export interface AdapterContext {
  tenantId: string;
  streamId: string;
}

export interface IngestRecord {
  tenantId: string;
  streamId: string;
  signal: 'metric' | 'span' | 'event' | 'log';
  payload: TelemetryEventPayload;
  tags: Record<string, string>;
  at: number;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  duplicates: number;
}

export interface TelemetryIngestAdapter {
  ingest(records: ReadonlyArray<IngestRecord>): Promise<IngestResult>;
}

const ingestSchema = createValidator(
  z.object({
    tenantId: z.string().min(1),
    streamId: z.string().min(1),
    signal: z.union([z.literal('metric'), z.literal('span'), z.literal('event'), z.literal('log')]),
    payload: z.unknown(),
    tags: z.record(z.string(), z.string()),
    at: z.number().int().nonnegative(),
  })
);

export const buildFingerprint = (record: IngestRecord): string => {
  const hash = createHash('sha256');
  hash.update(record.tenantId);
  hash.update(record.streamId);
  hash.update(record.signal);
  hash.update(String(record.at));
  hash.update(JSON.stringify(record.payload));
  return hash.digest('hex').slice(0, 32);
};

export const parsePayload = (record: IngestRecord): TelemetrySample => {
  const normalized = record.signal === 'metric'
    ? ({ ...record, payload: record.payload as MetricSample, id: buildFingerprint(record) } as TelemetrySample<MetricSample>)
    : ({ ...record, payload: record.payload as SpanSample, id: buildFingerprint(record) } as TelemetrySample<SpanSample>);

  return normalized;
};

export const toEnvelope = (record: IngestRecord): TelemetryEnvelope => {
  const sample = parsePayload(record);
  return {
    id: buildFingerprint(record) as TelemetryEnvelope['id'],
    sample: sample as TelemetryEnvelope['sample'],
    fingerprint: buildFingerprint({ ...record, at: record.at - (record.at % 1000) }),
    createdAt: record.at as TelemetryEnvelope['createdAt'],
  };
};

export class TelemetryBatchAdapter implements TelemetryIngestAdapter {
  private readonly seen = new Set<string>();
  async ingest(records: ReadonlyArray<IngestRecord>): Promise<IngestResult> {
    let accepted = 0;
    let rejected = 0;
    let duplicates = 0;

    for (const record of records) {
      const parsed = ingestSchema.parse(record);
      if (!parsed.ok) {
        rejected += 1;
        continue;
      }
      const fingerprint = buildFingerprint(record);
      if (this.seen.has(fingerprint)) {
        duplicates += 1;
        continue;
      }
      this.seen.add(fingerprint);
      accepted += 1;
      const _ = parsed.value;
    }

    return { accepted, rejected, duplicates };
  }
}

export const summarizeMatches = (matches: ReadonlyArray<AlertMatch>): number => {
  return matches.reduce((sum, match) => sum + (match.score * 1000), 0);
};
