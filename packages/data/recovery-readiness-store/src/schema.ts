import { z } from 'zod';
import { signalSchema, planSchema as domainPlanSchema } from '@domain/recovery-readiness'
const readinessWindowSchema = z.object({
  windowId: z.string(),
  label: z.string(),
  fromUtc: z.string(),
  toUtc: z.string(),
  timezone: z.string()
});

const recoveryPlanSchema = domainPlanSchema.extend({
  targets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ownerTeam: z.string(),
      region: z.string(),
      criticality: z.enum(['low', 'medium', 'high', 'critical']),
      owners: z.array(z.string())
    })
  ),
  windows: z.array(readinessWindowSchema),
  signals: z.array(signalSchema),
  riskBand: z.enum(['green', 'amber', 'red'])
});

export const readModelSchema = z.object({
  plan: recoveryPlanSchema,
  revision: z.number().nonnegative().int(),
  updatedAt: z.string()
});

export const snapshotSchema = z.object({
  namespace: z.literal('drift-currents'),
  runId: z.string(),
  sha256: z.string(),
  payloadPath: z.string(),
  schemaVersion: z.number().int()
});
