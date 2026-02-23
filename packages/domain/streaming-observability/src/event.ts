import { StreamHealthLevel } from './types';

export type StreamEventType = 'lag-rise' | 'lag-drop' | 'throughput-shift' | 'rebalance' | 'failure' | 'recovery';

export interface StreamEventRecord {
  tenant: string;
  streamId: string;
  eventType: StreamEventType;
  latencyMs: number;
  sampleAt: string;
  metadata: Record<string, string>;
  severity: number;
  eventId: string;
}

export const isStreamEventRecord = (value: unknown): value is StreamEventRecord => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StreamEventRecord;
  const severity = Number(candidate.severity);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) return false;
  if (!candidate.streamId || !candidate.sampleAt || !candidate.eventType) return false;
  return true;
};

export const parseEventPayload = (value: unknown): StreamEventRecord | null =>
  isStreamEventRecord(value) ? { ...value, metadata: value.metadata ?? {} } : null;

export interface EventEnvelope<TPayload = unknown> {
  id: string;
  streamId: string;
  payload: TPayload;
  receivedAt: string;
  eventType: StreamEventType;
}

export const dedupeByStream = <T extends Pick<StreamEventRecord, 'tenant' | 'streamId' | 'sampleAt' | 'eventType'>>(
  records: readonly T[],
): T[] => {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const record of records) {
    const composite = `${record.tenant}|${record.streamId}|${record.eventType}|${record.sampleAt}`;
    if (seen.has(composite)) continue;
    seen.add(composite);
    output.push(record);
  }
  return output;
};

export interface HealthEnvelope {
  streamId: string;
  level: StreamHealthLevel;
  score: number;
  notes: string[];
}

export const severityToHealthLevel = (severity: number): StreamHealthLevel => {
  if (severity >= 4) return 'critical';
  if (severity >= 2) return 'warning';
  return 'ok';
};

export const aggregateHealthScore = (events: readonly StreamEventRecord[]): number => {
  if (events.length === 0) return 1;
  const penalty = events.reduce((acc, event) => acc + event.severity / 10, 0);
  const raw = Math.max(0, 1 - penalty / Math.max(events.length, 1));
  return Number(raw.toFixed(3));
};
