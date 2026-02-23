import { randomUUID } from 'node:crypto';
import { ok, fail, type Result } from '@shared/result';
import { normalizeLimit, type Brand } from '@shared/core';
import type {
  ContinuityReadinessSignal,
  ContinuityReadinessSignalId,
  ContinuityReadinessTenantId,
  ContinuityReadinessSurfaceId,
  ContinuitySignalSource,
  ContinuityReadinessSignal as Signal,
  ContinuityReadinessWindow,
} from './types';

export interface RawSignalInput {
  readonly tenantId: string;
  readonly surfaceId: string;
  readonly title: string;
  readonly source: ContinuitySignalSource;
  readonly severity: number;
  readonly impact: number;
  readonly confidence: number;
  readonly observedAt: string;
  readonly ageMinutes?: number;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, string | number | boolean>;
}

const toSignalId = (value: string): ContinuityReadinessSignalId => value as Brand<string, 'ContinuityReadinessSignalId'>;
const normalizeSeverity = (value: number): number => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const normalizeConfidence = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const normalizeAge = (value: number): number => Number.isFinite(value) ? Math.max(0, value) : 0;

const clampTag = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 32);

const buildSignalId = (tenantId: string, surfaceId: string, title: string): ContinuityReadinessSignalId =>
  toSignalId(`${tenantId}:${surfaceId}:${title}`.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-') + `:${randomUUID()}`);

export const normalizeSignalTags = (value: readonly string[] = []): readonly string[] => {
  const safe = [...value]
    .map(clampTag)
    .filter((tag) => tag.length > 0)
    .slice(0, 12);
  return [...new Set(safe)];
};

export const buildSignal = (input: RawSignalInput, nowIso: string): Result<Signal, Error> => {
  if (!input.title) {
    return fail(new Error('signal title required'));
  }
  if (input.severity < 0 || input.impact < 0) {
    return fail(new Error('negative score values not allowed'));
  }

  const signal: ContinuityReadinessSignal = {
    id: buildSignalId(input.tenantId, input.surfaceId, input.title),
    tenantId: input.tenantId as ContinuityReadinessTenantId,
    surfaceId: input.surfaceId as ContinuityReadinessSurfaceId,
    title: input.title,
    source: input.source,
    severity: normalizeSeverity(input.severity),
    impact: normalizeSeverity(input.impact),
    confidence: normalizeConfidence(input.confidence),
    observedAt: input.observedAt,
    ageMinutes: normalizeAge(input.ageMinutes ?? 0),
    tags: normalizeSignalTags(input.tags),
    metadata: {
      ...(input.metadata ?? {}),
      normalizedAt: nowIso,
      sourcePriority: input.source === 'advisor' ? 'high' : 'normal',
    },
  };

  return ok(signal);
};

export const dedupeSignals = (signals: readonly ContinuityReadinessSignal[]): readonly ContinuityReadinessSignal[] => {
  const seen = new Set<string>();
  const output: ContinuityReadinessSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.surfaceId}|${signal.title}|${signal.source}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(signal);
  }
  return output;
};

export const rankSignalsByWeight = (signals: readonly ContinuityReadinessSignal[]): readonly ContinuityReadinessSignal[] => {
  return [...signals].sort((left, right) => {
    const leftScore = left.severity * 0.6 + left.impact * 0.4 + left.confidence * 10;
    const rightScore = right.severity * 0.6 + right.impact * 0.4 + right.confidence * 10;
    return rightScore - leftScore;
  });
};

export const sampleSignalsForWindow = (
  signals: readonly ContinuityReadinessSignal[],
  window: ContinuityReadinessWindow,
): ContinuityReadinessSignal[] => {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return [];
  }

  return signals.filter((signal) => {
    const observed = Date.parse(signal.observedAt);
    if (!Number.isFinite(observed)) {
      return false;
    }

    return observed >= from && observed <= to;
  });
};

export const buildSignalSeries = (signals: readonly ContinuityReadinessSignal[], limit = 25): readonly ContinuityReadinessSignal[] => {
  const sorted = rankSignalsByWeight(signals);
  const capped = sorted.slice(0, normalizeLimit(limit));
  const maxConfidence = capped.length ? Math.max(...capped.map((signal) => signal.confidence)) : 0;
  if (maxConfidence < 0.5) {
    return capped.map((signal) => ({
      ...signal,
      metadata: {
        ...signal.metadata,
        lowConfidence: true,
        normalizedAt: new Date().toISOString(),
      },
    }));
  }

  return capped;
};
