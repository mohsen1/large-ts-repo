import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import type {
  FusionSignal,
  FusionSignalId,
  FusionWave,
  FusionBundle,
  FusionReadinessState,
} from './types';

export type IngestionStatus = 'accepted' | 'rejected' | 'deduplicated';

export interface RawSignalEnvelope {
  readonly tenant: string;
  readonly runId: string;
  readonly source: string;
  readonly signalId?: string;
  readonly severity?: number;
  readonly observedAt?: string;
  readonly commandId?: string;
  readonly payload?: Record<string, unknown>;
  readonly signalOwner?: string;
}

export interface SignalIngested {
  readonly signal: FusionSignal;
  readonly status: IngestionStatus;
  readonly reason?: string;
}

export interface WaveSignalBucket {
  readonly wave: FusionWave;
  readonly signals: readonly FusionSignal[];
  readonly readinessState: FusionReadinessState;
}

const now = (): string => new Date().toISOString();

const asSignalId = (value: string): FusionSignalId => withBrand(value, 'RecoverySignalId');

const parseObservedAt = (value?: string): string => {
  if (!value) {
    return now();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return now();
  }
  return new Date(parsed).toISOString();
};

const scoreByPayload = (payload: Record<string, unknown> | undefined): number => {
  if (!payload) return 0.4;
  const value = payload.confidence;
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.4;
  return Math.max(0, Math.min(1, value));
};

const mapToSignal = (input: RawSignalEnvelope, runId: string, sequence: number): FusionSignal => ({
  id: asSignalId(`${runId}:${sequence}:${input.signalId ?? input.source}`),
  runId: runId as FusionBundle['runId'],
  source: input.source,
  severity: scoreByPayload(input.payload),
  confidence: scoreByPayload(input.payload),
  detectedAt: parseObservedAt(input.observedAt),
  tags: [input.tenant, runId, input.source, input.commandId ?? 'none'],
  payload: input.payload ?? {},
  observedAt: parseObservedAt(input.observedAt),
  details: input.payload ?? {},
});

const dedupeSignals = (signals: readonly FusionSignal[]): FusionSignal[] => {
  const seen = new Set<string>();
  const deduped: FusionSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.runId}:${signal.source}:${signal.observedAt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(signal);
  }
  return deduped;
};

const assignWave = (bundle: FusionBundle, signal: FusionSignal): FusionWave | undefined => {
  if (!bundle.waves.length) {
    return undefined;
  }
  const stableSorted = [...bundle.waves].sort((a, b) => a.windowStart.localeCompare(b.windowStart));
  const index = Math.abs(signal.id.length % stableSorted.length);
  return stableSorted[index];
};

export const ingestSignals = (
  bundle: FusionBundle,
  payloads: readonly RawSignalEnvelope[],
): Result<{
  readonly events: readonly SignalIngested[];
  readonly bucketed: readonly WaveSignalBucket[];
  readonly rejected: readonly string[];
}, Error> => {
  if (!Array.isArray(payloads)) {
    return fail(new Error('invalid-signal-payload'));
  }

  const signals = dedupeSignals(
    payloads
      .map((payload, index) => mapToSignal(payload, bundle.runId, index))
      .filter((signal) => signal.source.length > 0),
  );

  const byWave = new Map<string, FusionSignal[]>();
  const events: SignalIngested[] = [];
  const rejected: string[] = [];

  for (const signal of signals) {
    const wave = assignWave(bundle, signal);
    if (!wave) {
      rejected.push(signal.id);
      events.push({
        signal,
        status: 'rejected',
        reason: 'no-wave-defined',
      });
      continue;
    }

    const bucket = byWave.get(wave.id) ?? [];
    bucket.push(signal);
    byWave.set(wave.id, bucket);
    events.push({
      signal,
      status: bucket.length > 1 ? 'deduplicated' : 'accepted',
    });
  }

  const bucketed = [...byWave.entries()].map(([waveId, signals]) => {
    const wave = bundle.waves.find((candidate) => candidate.id === waveId);
    return {
      wave: wave ?? bundle.waves[0]!,
      signals,
      readinessState: wave?.state ?? 'idle',
    };
  });

  return ok({
    events,
    bucketed,
    rejected,
  });
};
