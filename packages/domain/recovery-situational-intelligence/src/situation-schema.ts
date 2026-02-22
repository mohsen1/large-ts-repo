import { z } from 'zod';
import type { IncidentPhase, CommandStatus, Criticality, RegionCode } from './situation-types';

export const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().min(20));

const criticalitySchema = z.number().int().min(1).max(5) as z.ZodType<Criticality>;

export const regionSchema = z.enum(['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'sa-east-1']) as z.ZodType<RegionCode>;

export const phaseSchema = z.enum(['detect', 'assess', 'mitigate', 'recover', 'stabilize']) as z.ZodType<IncidentPhase>;

export const statusSchema = z.enum(['queued', 'running', 'succeeded', 'degraded', 'failed', 'cancelled']) as z.ZodType<CommandStatus>;

export const signalSchema = z.object({
  signalId: z.string().min(1),
  domain: z.string().min(1),
  severity: criticalitySchema,
  summary: z.string().min(1),
  source: z.string().min(1),
  tags: z.array(z.string()).default([]),
  createdAt: isoDateSchema,
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().min(0),
});

export const dependencySchema = z.object({
  dependencyId: z.string().min(1),
  dependencyName: z.string().min(1),
  criticality: criticalitySchema,
  region: regionSchema,
  ownerTeam: z.string().min(1),
  blastRadius: z.enum(['host', 'region', 'zone', 'global']),
});

export const workloadNodeSchema = z.object({
  nodeId: z.string().min(1),
  name: z.string().min(1),
  service: z.string().min(1),
  region: regionSchema,
  dependencies: z.array(z.string()),
  dependencyGraph: z.array(dependencySchema),
  criticality: criticalitySchema,
  recoverySlaMinutes: z.number().int().positive(),
});

export const snapshotSchema = z.object({
  snapshotId: z.string().min(1),
  workloadNodeId: z.string().min(1),
  window: z.object({
    start: isoDateSchema,
    end: isoDateSchema,
    timezone: z.string().min(1),
  }),
  cpuUtilization: z.number().min(0).max(100),
  memoryUtilization: z.number().min(0).max(100),
  latencyP95Ms: z.number().min(0),
  availabilityPercent: z.number().min(0).max(100),
  errorBudget: z.number().min(0).max(1),
  activeTrafficRatio: z.number().min(0).max(1),
  measuredAt: isoDateSchema,
});

export const planSchema = z.object({
  planId: z.string().min(1),
  workloadNodeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  sourceSignalIds: z.array(z.string()),
  hypotheses: z.array(
    z.object({
      hypothesisId: z.string().min(1),
      label: z.string().min(1),
      evidenceWeight: z.number().min(0).max(1),
      commands: z.array(z.string()),
      likelyImpactPercent: z.number().min(0).max(100),
      sideEffects: z.array(z.string()),
    }),
  ),
  estimatedRestorationMinutes: z.number().min(1),
  confidence: z.number().min(0).max(1),
  createdAt: isoDateSchema,
});

export const commandSchema = z.object({
  commandId: z.string().min(1),
  status: statusSchema,
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.optional(),
  details: z.string().min(1),
  dryRun: z.boolean(),
});

export const assessmentSchema = z.object({
  assessmentId: z.string().min(1),
  phase: phaseSchema,
  status: statusSchema,
  workload: workloadNodeSchema,
  snapshot: snapshotSchema,
  signalCount: z.number().int().nonnegative(),
  weightedConfidence: z.number().min(0).max(1),
  plan: planSchema,
  commands: z.array(commandSchema),
});

export const planningContextSchema = z.object({
  operator: z.string().min(1),
  createdAt: isoDateSchema,
  environment: z.enum(['prod', 'staging', 'drill']),
  policyTag: z.string().min(1),
  correlationToken: z.string().min(1),
  tags: z.array(z.string()),
});

export const parseAssessment = (value: unknown) => assessmentSchema.parse(value);
