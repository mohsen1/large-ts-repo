import { z } from 'zod';
import { withBrand } from '@shared/core';

import type { PolicyHistoryRecord } from './models';
import { parsePolicyOutcome } from '@domain/recovery-operations-governance';

const findingRecordSchema = z.object({
  ruleId: z.string().min(1),
  scope: z.enum(['session', 'plan', 'fleet']),
  severity: z.enum(['allow', 'warn', 'block']),
  matched: z.boolean(),
  message: z.string().min(1),
  details: z.record(z.unknown()),
});

const historySchema = z.object({
  tenant: z.string().min(1),
  runId: z.string().min(1),
  policyId: z.string().min(1),
  evaluatedAt: z.string().datetime(),
  blocked: z.boolean(),
  score: z.number().finite(),
  findings: z.array(findingRecordSchema),
});

const filterSchema = z.object({
  tenant: z.string().optional(),
  policyId: z.string().optional(),
  blocked: z.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const parsePolicyHistory = (input: unknown): PolicyHistoryRecord => {
  const parsed = historySchema.parse(input);
  const parsedOutcome = parsePolicyOutcome({
    tenant: parsed.tenant,
    runId: parsed.runId,
    assessedAt: parsed.evaluatedAt,
    metadata: {
      policyId: parsed.policyId,
      policyName: 'stored-governance-eval',
      ownerTeam: 'recovery-ops',
      updatedAt: new Date().toISOString(),
      version: '1',
    },
    signalsCount: 0,
    findings: parsed.findings,
    score: parsed.score,
    blocked: parsed.blocked,
  });

  return {
    ...parsedOutcome,
    runId: parsed.runId,
    tenant: withBrand(parsed.tenant, 'TenantId'),
    policyId: parsed.policyId,
    evaluatedAt: parsed.evaluatedAt,
    score: parsed.score,
    findings: parsedOutcome.findings,
  };
};

export const parseHistoryFilter = (input: unknown) => filterSchema.parse(input);
