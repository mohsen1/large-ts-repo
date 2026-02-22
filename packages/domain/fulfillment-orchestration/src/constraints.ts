import { z } from 'zod';

export const fulfillmentStepContextSchema = z.object({
  warehouseId: z.string().min(1),
  area: z.string().min(1),
  station: z.string().min(1),
  priority: z.number().int().min(0).max(100),
  metadata: z.record(z.unknown()).optional(),
});

export const fulfillmentPlanDraftSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().min(1),
  strategy: z.enum(['standard', 'express', 'cold-chain', 'international']),
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.string(),
        context: fulfillmentStepContextSchema,
        dependsOn: z.array(z.string()),
      }),
    )
    .min(1),
  dueAt: z.string().datetime().optional(),
});

export const fulfillmentRiskSchema = z.object({
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  reviewed: z.boolean().default(false),
});

export type FulfillmentPlanDraft = z.infer<typeof fulfillmentPlanDraftSchema>;
export type FulfillmentStepContext = z.infer<typeof fulfillmentStepContextSchema>;
export type FulfillmentRiskInput = z.infer<typeof fulfillmentRiskSchema>;

export const normalizeStepContext = (value: unknown): FulfillmentStepContext => {
  return fulfillmentStepContextSchema.parse(value);
};
