import { z } from 'zod';
import { signalSchema, planSchema } from '@domain/recovery-readiness/src/schema';

export const readModelSchema = z.object({
  plan: planSchema,
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
  signals: z.array(signalSchema),
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
