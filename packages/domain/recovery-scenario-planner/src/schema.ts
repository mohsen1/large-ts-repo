import { z } from 'zod';

export const scenarioIdSchema = z.string().min(8);
export const tenantSchema = z.string().min(3);

export const forecastWindowSchema = z.object({
  runAtUtc: z.string(),
  confidence: z.number().min(0).max(1),
  forecastMinutes: z.number().positive(),
  forecastLabel: z.enum(['optimistic', 'expected', 'pessimistic']),
});

export const actionCandidateSchema = z.object({
  actionId: z.string().min(4),
  service: z.string().min(3),
  category: z.enum(['rollback', 'evacuate', 'scale', 'patch', 'validate']),
  estimatedMinutes: z.number().nonnegative(),
  sideEffects: z.array(z.string()),
  rollbackMinutes: z.number().nonnegative(),
  labels: z.array(z.string()),
  dependency: z.object({
    dependencyId: z.string().min(8),
    dependsOn: z.array(z.string()),
    requiredSignalId: z.string().optional(),
  }),
});

export const signalSchema = z.object({
  signalId: z.string().min(12),
  tenantId: z.string().min(3),
  entity: z.string().min(2),
  timestampUtc: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  fingerprint: z.object({
    source: z.string(),
    code: z.string(),
    attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
});

export const policySchema = z.object({
  policyId: z.string().min(8),
  tenantId: z.string().min(3),
  priorityBuckets: z.array(z.enum(['low', 'medium', 'high', 'critical'])),
  mustMaintainReadiness: z.boolean(),
  preferredClockSkewSeconds: z.number().nonnegative(),
  constraints: z.object({
    maxConcurrency: z.number().positive().int(),
    allowedCategories: z.array(z.enum(['rollback', 'evacuate', 'scale', 'patch', 'validate'])),
    blackoutWindows: z.array(
      z.object({
        windowId: z.string(),
        startUtc: z.string(),
        endUtc: z.string(),
        region: z.string(),
        ownerTeam: z.string(),
      }),
    ),
    slaMinutes: z.number().positive(),
  }),
});
