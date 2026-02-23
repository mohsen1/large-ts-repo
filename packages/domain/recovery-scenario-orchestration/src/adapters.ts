import { z } from 'zod';
import type { RuntimeEnvelope } from './types';
import type { ConstraintSnapshot } from './types';

export const strategyConfSchema = z.object({
  tenantId: z.string().min(1),
  incidentId: z.string().min(1),
  scenarioId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
});

export const decodeConfidence = (value: unknown): number => {
  const parsed = z.number().min(0).max(1).safeParse(typeof value === 'number' ? value : Number(value));
  return parsed.success ? parsed.data : 0;
};

export const calculateConfidence = (snapshots: readonly ConstraintSnapshot[]): number => {
  if (snapshots.length === 0) {
    return 0;
  }

  const score = snapshots.reduce((acc, snapshot) => acc + snapshot.score, 0) / snapshots.length;
  return decodeConfidence(score);
};

export const mergeSignals = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  return {
    ...left,
    ...right,
    mergedAt: new Date().toISOString(),
  };
};

export const normalizeRuntimeEnvelope = (envelope: RuntimeEnvelope): string => {
  return JSON.stringify(envelope);
};
