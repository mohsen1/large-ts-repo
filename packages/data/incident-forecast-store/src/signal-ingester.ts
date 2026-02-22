import { z } from 'zod';
import type { SignalObservation } from '@domain/incident-forecasting';
import { validateSignal } from '@domain/incident-forecasting';
import { fail, ok, type Result } from '@shared/result';

const SignalBatch = z.array(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    sourceSystem: z.string(),
    severity: z.number().int().min(1).max(5),
    confidence: z.number().min(0).max(1),
    eventType: z.string(),
    metadata: z.record(z.unknown()),
    observedAt: z.string().datetime(),
  }),
);

export type IngestedSignalBatch = {
  readonly tenantId: string;
  readonly count: number;
  readonly signals: SignalObservation[];
};

export const ingestSignals = (raw: unknown): Result<IngestedSignalBatch, Error> => {
  const parsed = SignalBatch.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error);
  }

  const normalized = parsed.data.map((rawSignal) => validateSignal(rawSignal));
  const firstTenant = normalized[0]?.tenantId;
  const hasSameTenant = normalized.every((signal) => signal.tenantId === firstTenant);

  if (!hasSameTenant) {
    return fail(new Error('batch contains mixed tenants'));
  }

  return ok({ tenantId: firstTenant, count: normalized.length, signals: normalized });
};
