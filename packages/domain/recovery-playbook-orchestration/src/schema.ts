import { z } from 'zod';

const severity = z.enum(['low', 'medium', 'high', 'critical']);
const band = z.enum(['green', 'amber', 'red']);
const executionMode = z.enum(['dry-run', 'canary', 'full']);

const evidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['telemetry', 'slo', 'policy', 'agent']),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

const driftSignalSchema = z.object({
  id: z.string(),
  signal: z.string(),
  severity: severity,
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  capturedAt: z.string(),
  evidence: z.array(evidenceSchema),
});

const scenarioNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  dependencies: z.array(z.string()),
  expectedDurationMinutes: z.number().int().nonnegative(),
  riskImpact: z.number().min(0).max(1),
  signals: z.array(driftSignalSchema),
  policyBindings: z.array(z.string()),
});

const scenarioGraphSchema = z.object({
  nodes: z.record(scenarioNodeSchema),
  order: z.array(z.string()),
  metadata: z.object({
    estimatedDurationMinutes: z.number().int().nonnegative(),
    blastRadius: band,
  }),
});

const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  description: z.string(),
  requiredPolicies: z.array(z.string()),
  forbiddenPolicies: z.array(z.string()),
});

const planningWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
  mode: executionMode,
});

const baseMetricSchema = z.object({
  at: z.string(),
  value: z.number(),
  unit: z.string(),
});

export const readinessMetricSchema = baseMetricSchema.extend({
  metric: z.string(),
  source: z.string(),
  band,
});

export const recoveryPlaybookSchema = z.object({
  id: z.string(),
  title: z.string(),
  tenant: z.string(),
  createdAt: z.string(),
  scenarioGraph: scenarioGraphSchema,
  policies: z.record(policySchema),
  priorities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const orchestrationPlanSchema = z.object({
  id: z.string(),
  playbookId: z.string(),
  window: planningWindowSchema,
  trace: z.array(
    z.object({
      step: z.string(),
      startedAt: z.string(),
      startedBy: z.string(),
      outcome: z.enum(['pass', 'fail', 'blocked']),
      metrics: z.array(baseMetricSchema),
    }),
  ),
  version: z.number().int().nonnegative(),
});

export const tenantContextSchema = z.object({
  tenantId: z.string(),
  region: z.string(),
  environment: z.enum(['prod', 'staging', 'sandbox']),
});

export const planEnvelopeSchema = z.object({
  tenantContext: tenantContextSchema,
  plan: orchestrationPlanSchema,
  rationale: z.string(),
  createdAt: z.string(),
});

export const parseRecoveryPlaybook = (value: unknown) => recoveryPlaybookSchema.parse(value);
export const parsePlanEnvelope = (value: unknown) => planEnvelopeSchema.parse(value);
