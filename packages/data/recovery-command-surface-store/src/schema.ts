import { z } from 'zod';

export const surfaceSignalSchema = z.object({
  key: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(['ms', 'percent', 'count', 'ratio', 'unknown']),
  timestamp: z.string(),
});

export const surfaceRunStateSchema = z.enum([
  'pending',
  'scheduled',
  'in_flight',
  'validated',
  'completed',
  'failed',
  'rolled_back',
]);

export const surfaceRunStepSchema = z.object({
  commandId: z.string(),
  at: z.string(),
  state: surfaceRunStateSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  executor: z.string(),
  host: z.string(),
  output: z.record(z.unknown()),
  error: z.string().optional(),
});

export const surfaceRunSchema = z.object({
  id: z.string(),
  tenant: z.string(),
  planId: z.string(),
  scenario: z.string(),
  requestedBy: z.string(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  state: surfaceRunStateSchema,
  steps: z.array(surfaceRunStepSchema),
  signals: z.array(surfaceSignalSchema),
  riskScore: z.number().min(0),
});

export const surfacePlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  surface: z.object({
    tenant: z.string(),
    region: z.string(),
    zone: z.string(),
    accountId: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  commands: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(['stabilize', 'reroute', 'quarantine', 'rollback', 'verify']),
      instructions: z.array(z.string()),
      inputs: z.array(
        z.object({
          command: z.string(),
          arguments: z.record(z.unknown()),
          priority: z.number(),
          expectedDurationMinutes: z.number().min(0),
        }),
      ),
      safetyTags: z.array(z.string()),
      requiresApproval: z.boolean(),
    }),
  ),
  dependencies: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      latencyMs: z.number().min(0),
      requiredReadiness: z.number().min(0).max(1),
    }),
  ),
  constraints: z.object({
    maxInFlight: z.number().min(1),
    maxRisk: z.number().min(0),
    allowedDowntimeMinutes: z.number().min(1),
  }),
});
