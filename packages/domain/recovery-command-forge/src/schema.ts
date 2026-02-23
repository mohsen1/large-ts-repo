import { z } from 'zod';

const utc = z
  .string()
  .datetime({ offset: true })
  .refine((value: string) => !Number.isNaN(Date.parse(value)), 'invalid UTC');

const severityRank = z.number().int().min(1).max(5);

export const forgeBudgetSchema = z.object({
  parallelismLimit: z.number().int().min(1).max(64),
  retryLimit: z.number().int().min(0).max(12),
  maxDurationMinutes: z.number().min(5).max(4320),
  approvalRequired: z.boolean(),
});

export const forgeSignalWeightSchema = z.object({
  source: z.string().min(1),
  reliability: z.number().min(0).max(1),
  impactWeight: z.number().min(0).max(5),
  urgencyBoost: z.number().min(0).max(10),
});

export const forgeDependencySchema = z.object({
  dependencyId: z.string().min(1),
  dependencyName: z.string().min(1),
  criticality: severityRank,
  coupling: z.number().min(0).max(1),
});

export const forgeNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  commandType: z.string().min(1),
  expectedDurationMinutes: z.number().min(1),
  ownerTeam: z.string().min(1),
  dependencies: z.array(forgeDependencySchema),
  resourceTags: z.array(z.string().min(1)),
});

export const forgeEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  dependencyStrength: z.number().min(0).max(1),
  isOptional: z.boolean(),
});

export const forgeGraphSchema = z.object({
  tenant: z.string().min(1),
  createdAt: utc,
  nodes: z.array(forgeNodeSchema).min(1),
  edges: z.array(forgeEdgeSchema),
});

export const forgeAttemptSchema = z.object({
  attemptId: z.string().min(1),
  runId: z.string().min(1),
  status: z.enum(['queued', 'executing', 'complete', 'failed']),
  startedAt: utc,
  finishedAt: utc.optional(),
  nodeCount: z.number().int().min(0),
  executedNodeIds: z.array(z.string().min(1)),
});

export const forgeForecastSchema = z.object({
  forecastId: z.string().min(1),
  commandWindowMinutes: z.number().min(1),
  signalVolume: z.number().min(0),
  expectedRisk: z.number().min(0).max(100),
  projectedSloMargin: z.number().min(-100).max(100),
  createdAt: utc,
});

export const forgePolicyGateSchema = z.object({
  gateId: z.string().min(1),
  name: z.string().min(1),
  passRate: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  details: z.string().min(1),
});

export const forgePolicyResultSchema = z.object({
  planId: z.string().min(1),
  summary: z.string().min(1),
  pass: z.boolean(),
  urgency: z.enum(['routine', 'urgent', 'critical']),
  riskScore: z.number().min(0).max(100),
  gates: z.array(forgePolicyGateSchema),
});

export type ForgeBudgetInput = z.input<typeof forgeBudgetSchema>;
export type ForgeBudgetModel = z.infer<typeof forgeBudgetSchema>;
export type ForgeNodeModel = z.infer<typeof forgeNodeSchema>;
export type ForgeGraphModel = z.infer<typeof forgeGraphSchema> & { planId: string };
export type ForgeAttemptModel = z.infer<typeof forgeAttemptSchema>;
export type ForgeForecastModel = z.infer<typeof forgeForecastSchema>;
export type ForgePolicyResultModel = z.infer<typeof forgePolicyResultSchema>;

export const parseGraph = (input: unknown): ForgeGraphModel => forgeGraphSchema.extend({ planId: z.string().min(1) }).parse(input);
export const parseForecast = (input: unknown): ForgeForecastModel => forgeForecastSchema.parse(input);
export const parsePolicy = (input: unknown): ForgePolicyResultModel => forgePolicyResultSchema.parse(input);
