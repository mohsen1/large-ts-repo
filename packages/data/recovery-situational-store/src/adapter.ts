import { z } from 'zod';
import type {
  Criticality,
  SituationalSignal,
  RecoveryPlanCandidate,
} from '@domain/recovery-situational-intelligence';

const signalSchema = z.object({
  signalId: z.string().min(1),
  domain: z.string().min(1),
  severity: z.number().int().min(1).max(5) as z.ZodType<Criticality>,
  summary: z.string().min(1),
  source: z.string().min(1),
  tags: z.array(z.string()),
  createdAt: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().min(0),
}) as z.ZodType<SituationalSignal>;

const planSchema = z.object({
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
      likelyImpactPercent: z.number(),
      sideEffects: z.array(z.string()),
    }),
  ),
  estimatedRestorationMinutes: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});

export const parseSignal = (raw: unknown): SituationalSignal => signalSchema.parse(raw);
export const parsePlan = (raw: unknown): RecoveryPlanCandidate => planSchema.parse(raw);

export const toJsonLines = (input: readonly unknown[]): string =>
  input.map((item) => JSON.stringify(item)).join('\n');

export const fromJsonLines = (input: string): readonly unknown[] =>
  input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
