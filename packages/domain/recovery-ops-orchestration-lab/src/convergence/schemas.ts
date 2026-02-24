import { z } from 'zod';
import type { JsonValue } from '@shared/type-level';

export const convergencePhaseSchema = z.union([
  z.literal('discover'),
  z.literal('prioritize'),
  z.literal('simulate'),
  z.literal('rehearse'),
  z.literal('verify'),
  z.literal('close'),
]);

export const convergenceSignalSchema = z.object({
  id: z.string().min(3),
  source: z.string(),
  tier: z.union([z.literal('l1'), z.literal('l2'), z.literal('l3')]),
  score: z.number().min(0).max(100),
  domain: z.string(),
  tags: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    }),
  ),
  observedAt: z.string().datetime(),
});

export const convergenceStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string().min(1),
  arguments: z.array(z.unknown()),
  reversible: z.boolean(),
  dependencies: z.array(z.string()),
});

export const convergencePlanSchema = z.object({
  id: z.string().min(3),
  workspaceId: z.string().min(3),
  title: z.string().min(3),
  score: z.number().min(0),
  steps: z.array(convergenceStepSchema),
  constraints: z.array(
    z.object({
      key: z.string().min(1),
      value: z.unknown(),
    }),
  ),
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()),
});

export const convergenceWorkspaceSchema = z.object({
  id: z.string().min(3),
  domainId: z.string().min(3),
  policyId: z.string().min(1),
  domain: z.string(),
  health: z.union([z.literal('critical'), z.literal('degraded'), z.literal('stable')]),
  planBudget: z.number().min(1),
  signals: z.array(convergenceSignalSchema),
  plans: z.array(convergencePlanSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const convergenceMetricsSchema = z.object({
  latencyP50: z.number().min(0),
  latencyP95: z.number().min(0),
  successRate: z.number().min(0).max(1),
  recoveryReadiness: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
});

export const convergenceRunSchema = z.object({
  runId: z.string().min(3),
  workspaceId: z.string().min(3),
  durationMs: z.number().min(0),
  status: z.union([
    z.literal('queued'),
    z.literal('running'),
    z.literal('succeeded'),
    z.literal('failed'),
  ]),
  metrics: convergenceMetricsSchema,
  events: z.array(z.object({
    type: z.union([
      z.literal('phase'),
      z.literal('metric'),
      z.literal('command'),
    z.literal('error'),
    ]),
    at: z.string().datetime(),
    runId: z.string().min(3),
    phase: convergencePhaseSchema.optional(),
    payload: z.unknown(),
  })),
});

export const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) {
    return true;
  }
  if (value === undefined) {
    return true;
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isJsonValue(entry));
  }

  return false;
};

const identityRoundTrip = <T>(value: T): T => {
  const parsed = isJsonValue(value);
  if (!parsed) {
    throw new Error('non-json-value');
  }
  return value;
};

export const parseConvergenceWorkspace = (raw: unknown) => {
  const parsed = convergenceWorkspaceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid workspace');
  }

  return {
    ...parsed.data,
    metadata: identityRoundTrip(parsed.data as unknown),
  };
};

export const parseConvergenceRun = (raw: unknown) => {
  const parsed = convergenceRunSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid run');
  }
  return parsed.data;
};
