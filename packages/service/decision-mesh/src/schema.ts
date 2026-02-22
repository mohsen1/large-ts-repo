import { z } from 'zod';

export const DecisionRequestSchema = z.object({
  tenantId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
  policyId: z.string().trim().min(1),
  requestedBy: z.string().trim().min(1),
  context: z.record(z.unknown()),
  priority: z.number().finite().min(0).max(10).default(5),
  mode: z.enum(['deterministic', 'weighted', 'canary']).default('weighted'),
});

export const BatchRequestSchema = z.object({
  runId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  requests: z.array(DecisionRequestSchema).min(1).max(256),
  dryRun: z.boolean().default(false),
});

export const RegisterPolicyBatchSchema = z.object({
  policies: z.array(z.unknown()).min(1).max(200),
});

export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;
export type BatchRequest = z.infer<typeof BatchRequestSchema>;
export type RegisterPolicyBatch = z.infer<typeof RegisterPolicyBatchSchema>;
