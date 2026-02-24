import { z } from 'zod';
import { ForecastPlan, FulfillmentStressStrategy } from '@domain/fulfillment-orchestration-analytics';

export interface ForecastIntent {
  tenantId: string;
  strategy: FulfillmentStressStrategy;
  minimumCoverage: number;
  horizonMinutes: number;
}

const schema = z.object({
  tenantId: z.string().min(1),
  strategy: z.enum(['baseline', 'burst', 'throttle', 'preposition']),
  minimumCoverage: z.number().min(0).max(1),
  horizonMinutes: z.number().min(15).max(24 * 60 * 30),
});

export const validateForecastIntent = (intent: ForecastIntent): { ok: true } | { ok: false; error: string } => {
  const result = schema.safeParse(intent);
  if (result.success) return { ok: true };
  return { ok: false, error: result.error.message };
};

export const createDemandSignals = (tenantId: string, productId: string): ForecastPlan['scenario']['demandProfile'] => {
  const base = 20;
  return new Array(12).fill(0).map((_, index) => ({
    tenantId,
    productId,
    sku: `sku-${index}`,
    baseDemand: base + index,
    observedDemand: base + index * 1.25,
    seasonalFactor: 0.9 + index * 0.01,
    confidence: 0.5 + (index % 10) / 20,
    sampleWindowStart: new Date(Date.now() - index * 900_000).toISOString(),
    sampleWindowEnd: new Date(Date.now() - (index - 1) * 900_000).toISOString(),
    source: index % 3 === 0 ? 'inventory' : 'sales',
  }));
};
