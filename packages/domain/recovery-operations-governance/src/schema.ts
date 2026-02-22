import { z } from 'zod';
import { withBrand } from '@shared/core';

import type { PolicyScope, PolicySeverity, PolicyPriority } from './types';

const ScopeSchema = z.enum(['session', 'plan', 'fleet']);
const SeveritySchema = z.enum(['allow', 'warn', 'block']);
const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const policyMetadataSchema = z.object({
  policyId: z.string().min(1),
  policyName: z.string().min(1),
  ownerTeam: z.string().min(1),
  updatedAt: z.string().datetime(),
  version: z.string().min(1),
});

const constraintSchema = z.object({
  scope: ScopeSchema as z.ZodType<PolicyScope>,
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  threshold: z.number().optional(),
});

const ruleSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
  priority: PrioritySchema as z.ZodType<PolicyPriority>,
  severity: SeveritySchema as z.ZodType<PolicySeverity>,
  reason: z.string().min(1),
  constraint: constraintSchema,
  tags: z.array(z.string()).default([]),
});

const findingSchema = z.object({
  ruleId: z.string().min(1),
  scope: ScopeSchema as z.ZodType<PolicyScope>,
  severity: SeveritySchema as z.ZodType<PolicySeverity>,
  matched: z.boolean(),
  message: z.string(),
  details: z.record(z.unknown()),
});

const outcomeSchema = z.object({
  tenant: z.string().min(1),
  runId: z.string().min(1).transform((value) => withBrand(value, 'RecoveryRunId')),
  assessedAt: z.string().datetime(),
  metadata: policyMetadataSchema,
  signalsCount: z.number().int().min(0),
  findings: z.array(findingSchema),
  score: z.number().finite(),
  blocked: z.boolean(),
});

export const parsePolicyMetadata = (input: unknown) => policyMetadataSchema.parse(input);
export const parsePolicyRule = (input: unknown) => ruleSchema.parse(input);
export const parsePolicyFinding = (input: unknown) => findingSchema.parse(input);
export const parsePolicyOutcome = (input: unknown) => outcomeSchema.parse(input);
